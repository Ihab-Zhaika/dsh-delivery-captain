import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const mod = await import('../lib/captain/providers.js').catch(() => ({}))
const config = { provider: 'github', repository: 'owner/repo', workspace: '.', milestones: ['M1'], remote: 'origin', targetBranch: 'main' }
const issue = (id, extra = {}) => ({ number: id, id: id + 100, title: `Ticket ${id}`, body: '', state: 'open', html_url: `https://github.com/owner/repo/issues/${id}`, milestone: { title: 'M1' }, labels: [], created_at: '2026-01-01', ...extra })
function fake(respond) {
  const calls = []
  const run = async (file, args, options) => {
    calls.push({ file, args, options })
    let result = await respond(file, args, options)
    if (result === undefined && args[0] === 'api' && /\/commits\/.*\/check-runs\?/.test(args[1])) result = [{ check_runs: [] }]
    if (result === undefined && args[0] === 'api' && /\/commits\/.*\/statuses\?/.test(args[1])) result = [[]]
    if (result === undefined && args.includes('pullRequestStatuses')) result = { value: [] }
    if (result === undefined && args.includes('pullRequestIterations')) result = { value: [{ id: 1, sourceRefCommit: { commitId: 'abc' } }] }
    if (result === undefined && args.includes('workItemTypeStates')) result = { value: [{ name: 'Active', category: 'InProgress' }, { name: 'Closed', category: 'Completed' }] }
    if (result?.fields?.['System.State']) result.fields = { 'System.WorkItemType': 'Task', 'System.TeamProject': 'P', ...result.fields }
    if (result === undefined) throw new Error(`Unexpected ${file} ${args.join(' ')}`)
    return typeof result === 'string' ? result : JSON.stringify(result)
  }
  return { calls, run }
}
test('provider factory exists', () => assert.equal(typeof mod.createProvider, 'function'))
test('GitHub reads all issue pages and external native predecessors; closed is not merged', async () => {
  const f = fake((file, a) => {
    const ep = a[1]
    if (ep === 'repos/owner/repo/issues?state=all&per_page=100') return [[issue(1, { body: 'Depends on #3' })], [issue(2, { state: 'closed' })]]
    if (ep === 'repos/owner/repo/issues/1/dependencies/blocked_by?per_page=100') return [[issue(4, { milestone: null })]]
    if (/dependencies\/blocked_by/.test(ep)) return [[]]
    if (ep === 'repos/owner/repo/issues/3') return issue(3, { state: 'closed', milestone: null })
    if (ep === 'graphql') return [{ data: { repository: { issue: { closedByPullRequestsReferences: { nodes: [], pageInfo: { hasNextPage: false } } } } } }]
  })
  const rows = await mod.createProvider(config, f.run).discover()
  assert.deepEqual(rows.find(x => x.id === '1').predecessors, ['4', '3'])
  assert.equal(rows.find(x => x.id === '2').merged, false)
  assert.equal(rows.find(x => x.id === '3').merged, false)
  assert.equal(rows.find(x => x.id === '4').milestone, '')
})
test('GitHub dependency API failure fails closed even with textual fallback', async () => {
  const f = fake((file, a) => a[1]?.startsWith('repos/owner/repo/issues?') ? [[issue(1, { body: 'Depends on #2' })]] : Promise.reject(new Error('HTTP 403')))
  await assert.rejects(() => mod.createProvider(config, f.run).discover(), /dependencies|403/)
})
test('GitHub records completed decision disposition separately from merged code proof',async()=>{
  const f=fake((_file,args)=>{
    if(args[1]==='repos/owner/repo/issues?state=all&per_page=100')return [[issue(1,{state:'closed',state_reason:'completed',labels:[{name:'kind:decision'}]})]]
    if(/dependencies\/blocked_by/.test(args[1]))return [[]]
    if(args[1]==='graphql')return [{data:{repository:{issue:{closedByPullRequestsReferences:{nodes:[],pageInfo:{hasNextPage:false}}}}}}]
  })
  const rows=await mod.createProvider(config,f.run).discover()
  assert.equal(rows[0].completedDecision,true);assert.equal(rows[0].merged,false)
})
test('GitHub recognizes explicit Markdown predecessor declarations without treating related links as blockers',async()=>{
  const f=fake((_file,args)=>{
    const path=args[1]
    if(path==='repos/owner/repo/issues?state=all&per_page=100')return [[issue(1,{body:'**Predecessors (must be closed first):** AB#200 [Foundation] #2 (Done).\nRelated: #3'})]]
    if(path==='repos/owner/repo/issues/2')return issue(2,{milestone:null})
    if(/dependencies\/blocked_by/.test(path))return [[]]
  })
  const tickets=await mod.createProvider(config,f.run).discover()
  assert.deepEqual(tickets.find(t=>t.id==='1').predecessors,['2'])
  assert.equal(tickets.some(t=>t.id==='3'),false)
})
test('GitHub preserves dependency declarations with no space after the colon',async()=>{
  const f=fake((_file,args)=>{
    if(args[1]==='repos/owner/repo/issues?state=all&per_page=100')return [[issue(1,{body:'Depends on:#2'})]]
    if(args[1]==='repos/owner/repo/issues/2')return issue(2,{milestone:null})
    if(/dependencies\/blocked_by/.test(args[1]))return [[]]
  })
  assert.deepEqual((await mod.createProvider(config,f.run).discover()).find(t=>t.id==='1').predecessors,['2'])
})
test('GitHub does not reinterpret foreign references ending in punctuation as local issues',async()=>{
  const f=fake((_file,args)=>{
    if(args[1]==='repos/owner/repo/issues?state=all&per_page=100')return [[issue(1,{body:'Blocked by: other/repo-#3 other/repo.#4, #2'})]]
    if(args[1]==='repos/owner/repo/issues/2')return issue(2,{milestone:null})
    if(/dependencies\/blocked_by/.test(args[1]))return [[]]
  })
  assert.deepEqual((await mod.createProvider(config,f.run).discover()).find(t=>t.id==='1').predecessors,['2'])
})
const task = { id: '1', ticket: issue(1), branch: 'captain/1', worktree: '.', headSha: 'abc', prUrl: 'https://github.com/owner/repo/pull/9' }
const pr = { number: 9, url: task.prUrl, headRefOid: 'abc', headRefName: task.branch, baseRefName: 'main', isCrossRepository: false, state: 'OPEN', isDraft: false, mergeStateStatus: 'CLEAN', reviewDecision: '', statusCheckRollup: [] }
test('GitHub refuses changed head and never requests merge', async () => {
  const f = fake((file, a) => a[0] === 'pr' && a[1] === 'view' ? { ...pr, headRefOid: 'changed' } : undefined)
  await assert.rejects(() => mod.createProvider(config, f.run).merge(task, 'abc'), /head/i)
  assert.equal(f.calls.some(x => x.args[1] === 'merge'), false)
})
test('GitHub merge uses exact-head guard without admin bypass and confirms merge', async () => {
  let merged = false
  const f = fake((file, a) => {
    if (a[0] === 'pr' && a[1] === 'view') return { ...pr, state: merged ? 'MERGED' : 'OPEN', mergeCommit: merged ? { oid: 'merge' } : null }
    if (a[0] === 'pr' && a[1] === 'merge') { assert.ok(a.includes('--match-head-commit')); assert.equal(a[a.indexOf('--match-head-commit') + 1], 'abc'); assert.ok(!a.includes('--admin')); merged = true; return '' }
  })
  assert.equal((await mod.createProvider(config, f.run).merge(task, 'abc')).merged, true)
})
test('Azure follows Reverse predecessors, ignores Forward/Related, verifies closed predecessor PR', async () => {
  const c = { ...config, provider: 'azure', repository: 'repo', organization: 'https://dev.azure.com/org', project: 'P' }
  const f = fake((file, a) => {
    if (a[0] === 'boards' && a[1] === 'query') return [{ id: 1 }]
    if (a[0] === 'boards' && a[1] === 'work-item' && a[2] === 'show') {
      const id = Number(a[a.indexOf('--id') + 1]); return { id, fields: { 'System.Title': `T${id}`, 'System.IterationPath': id === 1 ? 'M1' : 'Other', 'System.State': id === 1 ? 'Active' : 'Closed' }, relations: id === 1 ? [{ rel: 'System.LinkTypes.Dependency-Reverse', url: 'https://dev.azure.com/org/_apis/wit/workItems/2' }, { rel: 'System.LinkTypes.Dependency-Forward', url: 'https://dev.azure.com/org/_apis/wit/workItems/3' }, { rel: 'System.LinkTypes.Related', url: 'https://dev.azure.com/org/_apis/wit/workItems/4' }] : [] }
    }
  })
  const rows = await mod.createProvider(c, f.run).discover()
  assert.deepEqual(rows.map(x => x.id), ['1', '2'])
  assert.deepEqual(rows[0].predecessors, ['2'])
  assert.equal(rows[1].merged, false)
})

test('Azure empty backlog is a valid CLI null result', async () => {
  const f = fake(() => 'null')
  assert.deepEqual(await mod.createProvider({ ...config, provider: 'azure', organization: 'https://dev.azure.com/org', project: 'P' }, f.run).discover(), [])
})
test('Azure avoids the boards CLI silent 1000-item cap with complete WIQL references', async () => {
  const f = fake((file, a) => {
    if (a[0] === 'boards' && a[1] === 'query') return Array.from({ length: 1000 }, (_, n) => ({ id: n + 1 }))
    if (a[0] === 'devops' && a.includes('wiql')) return { workItems: Array.from({ length: 1001 }, (_, n) => ({ id: n + 1 })) }
    if (a[2] === 'show') { const id = a[a.indexOf('--id') + 1]; return { id, fields: { 'System.Title': id, 'System.State': 'Active', 'System.IterationPath': 'M1' } } }
  })
  const rows = await mod.createProvider({ ...config, provider: 'azure', organization: 'https://dev.azure.com/org', project: 'P' }, f.run).discover()
  assert.equal(rows.length, 1001)
})
const azureConfig = { ...config, provider: 'azure', repository: 'repo', organization: 'https://dev.azure.com/org', project: 'P' }
const azureTask = { ...task, ticket: { id: '1' }, prUrl: 'https://dev.azure.com/org/P/_git/repo/pullrequest/9' }
const azurePr = { pullRequestId: 9, lastMergeSourceCommit: { commitId: 'abc' }, sourceRefName: 'refs/heads/captain/1', targetRefName: 'refs/heads/main', repository: { id: 'repo' }, status: 'active', isDraft: false, mergeStatus: 'succeeded', reviewers: [] }
test('Azure merge sends expected head and explicitly disables policy bypass', async () => {
  let merged = false
  const f = fake(async (file, a) => {
    if (a[0] === 'repos' && a[2] === 'show') return { ...azurePr, status: merged ? 'completed' : 'active', lastMergeCommit: merged ? { commitId: 'merge' } : null }
    if (a[2] === 'policy') return [{ configuration: { isBlocking: true, isEnabled: true }, status: 'approved' }]
    if (a[0] === 'devops' && a.includes('PATCH')) {
      const payload = JSON.parse(await readFile(a[a.indexOf('--in-file') + 1], 'utf8'))
      assert.deepEqual(payload.lastMergeSourceCommit, { commitId: 'abc' })
      assert.equal(payload.completionOptions.bypassPolicy, false)
      assert.equal(payload.completionOptions.transitionWorkItems, false)
      merged = true; return {}
    }
  })
  assert.equal((await mod.createProvider(azureConfig, f.run).merge(azureTask, 'abc')).merged, true)
})
test('Azure rejects failed blocking policies and unknown head', async () => {
  const f = fake((file, a) => a[2] === 'show' ? azurePr : a[2] === 'policy' ? [{ configuration: { isBlocking: true }, status: 'rejected' }] : undefined)
  await assert.rejects(() => mod.createProvider(azureConfig, f.run).merge(azureTask, 'abc'), /policies/)
  await assert.rejects(() => mod.createProvider(azureConfig, f.run).merge(azureTask, 'changed'), /head/)
  assert.ok(!f.calls.some(x => x.args.includes('PATCH')))
})
test('GitHub merge refuses pending checks, changes requested, draft and unknown mergeability', async () => {
  for (const overrides of [{ statusCheckRollup: [{ __typename: 'CheckRun', status: 'IN_PROGRESS' }] }, { reviewDecision: 'CHANGES_REQUESTED' }, { isDraft: true }, { mergeStateStatus: 'UNKNOWN' }, { baseRefName: 'other' }]) {
    const f = fake((file, a) => a[1] === 'view' ? ({ ...pr, ...overrides }) : undefined)
    await assert.rejects(() => mod.createProvider(config, f.run).merge(task, 'abc'), /checks|policies/)
    assert.ok(!f.calls.some(x => x.args[1] === 'merge'))
  }
})
test('GitHub inspects paginated checks beyond the GraphQL rollup', async () => {
  const f = fake((file, a) => {
    if (a[1] === 'view') return pr
    if (a[1]?.includes('/check-runs?')) return [{ check_runs: [{ status: 'completed', conclusion: 'success' }] }, { check_runs: [{ status: 'completed', conclusion: 'failure' }] }]
  })
  await assert.rejects(() => mod.createProvider(config, f.run).merge(task, 'abc'), /checks/)
  assert.ok(!f.calls.some(x => x.args[1] === 'merge'))
})
test('Azure inspects current-iteration statuses and rejects a failed status', async () => {
  const f = fake((file, a) => {
    if (a[2] === 'show') return azurePr
    if (a[2] === 'policy') return []
    if (a.includes('pullRequestStatuses')) return { value: [{ id: 1, context: { name: 'ci', genre: 'build' }, iterationId: 1, state: 'failed' }] }
  })
  await assert.rejects(() => mod.createProvider(azureConfig, f.run).merge(azureTask, 'abc'), /policies|checks/)
  assert.ok(!f.calls.some(x => x.args.includes('PATCH')))
})
test('command runner preserves metacharacters as literal arguments', async () => {
  const { runCommand } = await import('../lib/captain/commands.js')
  const text = `literal & %PATH% $(bad) \"quote\" ; | > <`
  assert.equal((await runCommand(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', text])).trim(), text)
})
test('GitHub query keeps unmatched milestone tickets visible with a soft selection exclusion', async () => {
  const f = fake((file, a) => {
    if (a[1]?.startsWith('search/issues?')) return [{ total_count: 1, incomplete_results: false, items: [issue(1)] }]
    if (a[1]?.startsWith('repos/owner/repo/issues?')) return [[issue(1), issue(2)]]
    if (a[1]?.includes('/dependencies/')) return [[]]
  })
  const rows = await mod.createProvider({ ...config, query: 'label:ready' }, f.run).discover()
  assert.equal(rows.length, 2)
  assert.equal(rows[0].exclusion, undefined)
  assert.equal(rows[1].exclusion, undefined)
  assert.match(rows[1].selectionExclusion, /query/)
})
test('GitHub preflight rejects a mismatched push repository', async () => {
  const f = fake((file) => file === 'git' ? 'git@github.com:someone/else.git' : '{}')
  await assert.rejects(() => mod.createProvider(config, f.run).preflight(), /remote|repository/)
})
test('GitHub preflight uses the canonical repository endpoint without a trailing slash',async()=>{
  const f=fake((file,args)=>{
    if(file==='git')return 'https://github.com/owner/repo.git'
    if(args[0]==='auth')return ''
    assert.equal(args[1],'repos/owner/repo')
    return {full_name:'owner/repo'}
  })
  await mod.createProvider(config,f.run).preflight()
})
test('GitHub claim rejects another captain marker', async () => {
  const f = fake(() => [[{ body: '<!-- darkingdoom-claim:foreign -->' }]])
  await assert.rejects(() => mod.createProvider(config, f.run).claim({ id: '1' }, 'mine'), /another|foreign/)
})
test('Azure configured query preserves unmatched milestone catalog', async () => {
  const f = fake((file, a) => {
    if (a[1] === 'query') return a.includes('my filter') ? [{ id: 1 }] : [{ id: 1 }, { id: 2 }]
    if (a[2] === 'show') return { id: Number(a[a.indexOf('--id') + 1]), fields: { 'System.Title': 'T', 'System.State': 'Active', 'System.IterationPath': 'M1' } }
  })
  const rows = await mod.createProvider({ ...azureConfig, query: 'my filter' }, f.run).discover()
  assert.equal(rows.length, 2)
  assert.equal(rows[1].exclusion, undefined)
  assert.match(rows[1].selectionExclusion, /query/)
})
test('GitHub adopts existing branch PR, pushes reviewed SHA and restores ticket link', async () => {
  let linked = false
  const f = fake((file, a) => {
    if (file === 'git') return a[0] === 'rev-parse' ? 'abc' : ''
    if (a[1]?.startsWith('repos/owner/repo/pulls?')) return [[{ number: 9, html_url: pr.url, state: 'open', body: 'Worker details', head: { ref: task.branch, repo: { full_name: config.repository } }, base: { ref: 'main' } }]]
    if (a[1] === 'repos/owner/repo/pulls/9' && a.includes('PATCH')) { assert.ok(a.includes('body=Worker details\n\nCloses #1')); linked = true; return {} }
    if (a[1] === 'view') return pr
  })
  await mod.createProvider(config, f.run).ensurePullRequest({ ...task, ticket: { id: '1', title: 'T' } })
  assert.equal(linked, true)
  assert.ok(f.calls.some(x => x.file === 'git' && x.args.includes('abc:refs/heads/captain/1')))
  assert.ok(!f.calls.some(x => x.args.includes('POST')))
})
test('GitHub follow-up retries reuse marker and native dependencies', async () => {
  let created
  const deps = []
  let creates = 0
  const f = fake((file, a) => {
    if (a[1] === 'repos/owner/repo/issues?state=all&per_page=100') return [created ? [created] : []]
    if (a[1]?.startsWith('repos/owner/repo/milestones?')) return [[{ number: 1, title: 'M1' }]]
    if (a[1] === 'repos/owner/repo/issues' && a.includes('POST')) { creates++; created = issue(8, { body: a.find(x => x.startsWith('body=')).slice(5) }); return created }
    if (a[1] === 'repos/owner/repo/issues/1') return issue(1)
    if (a[1]?.endsWith('/blocked_by?per_page=100')) return [deps]
    if (a[1]?.endsWith('/blocked_by') && a.includes('POST')) { assert.ok(a.includes('issue_id=101')); deps.push(issue(1)); return issue(1) }
  })
  const provider = mod.createProvider(config, f.run)
  const input = { title: 'Next', body: 'Details', milestone: 'M1', predecessors: [] }
  assert.equal(await provider.createFollowup({ ...task, ticket: { id: '1' } }, input), '8')
  assert.equal(await provider.createFollowup({ ...task, ticket: { id: '1' } }, input), '8')
  assert.equal(creates, 1)
  assert.equal(deps.length, 1)
})
test('Azure follow-up retries reuse marker and add Reverse relation only once', async () => {
  let created = false; let linked = false
  const f = fake((file, a) => {
    if (a[1] === 'query') return created ? [{ id: 8 }] : 'null'
    if (a[2] === 'create') { assert.ok(a.some(x => x.startsWith('System.Tags=darkingdoom-followup:'))); created = true; return { id: 8 } }
    if (a[2] === 'show') return { id: 8, relations: linked ? [{ rel: 'System.LinkTypes.Dependency-Reverse', url: 'https://dev.azure.com/org/_apis/wit/workItems/1' }] : [] }
    if (a[2] === 'relation') { assert.ok(a.includes('System.LinkTypes.Dependency-Reverse')); linked = true; return {} }
  })
  const provider = mod.createProvider(azureConfig, f.run)
  const input = { title: 'Next', body: 'Details', milestone: 'M1', predecessors: [] }
  assert.equal(await provider.createFollowup(azureTask, input), '8')
  assert.equal(await provider.createFollowup(azureTask, input), '8')
  assert.equal(f.calls.filter(x => x.args[2] === 'create').length, 1)
  assert.equal(f.calls.filter(x => x.args[2] === 'relation').length, 1)
})
test('Both providers refuse to close tickets before confirmed merge', async () => {
  const gh = fake((file, a) => a[1] === 'view' ? pr : undefined)
  await assert.rejects(() => mod.createProvider(config, gh.run).close(task), /not yet confirmed/)
  const az = fake((file, a) => a[2] === 'show' ? azurePr : a[2] === 'policy' ? [] : undefined)
  await assert.rejects(() => mod.createProvider(azureConfig, az.run).close(azureTask), /not yet confirmed/)
  assert.ok(![...gh.calls, ...az.calls].some(x => x.args.includes('PATCH') || x.args.includes('update')))
})
test('Azure adopts existing branch PR and attaches its work item', async () => {
  let linked = false
  const f = fake((file, a) => {
    if (file === 'git') return a[0] === 'rev-parse' ? 'abc' : ''
    if (a[2] === 'list') return [azurePr]
    if (a[2] === 'show') return azurePr
    if (a[2] === 'policy') return []
    if (a[2] === 'work-item' && a[3] === 'list') return []
    if (a[2] === 'work-item' && a[3] === 'add') { linked = true; return [] }
  })
  await mod.createProvider(azureConfig, f.run).ensurePullRequest(azureTask)
  assert.equal(linked, true)
})
test('GitHub merged closing reference proves delivery; external predecessors stay excluded', async () => {
  const external = issue(2, { html_url: 'https://github.com/other/repo/issues/2', state: 'closed' })
  const f = fake((file, a) => {
    if (a[1]?.startsWith('repos/owner/repo/issues?')) return [[issue(1)]]
    if (a[1]?.includes('/issues/1/dependencies/')) return [[external]]
    if (a[1]?.includes('/dependencies/')) return [[]]
    if (a[1] === 'graphql') return [{ data: { repository: { issue: { closedByPullRequestsReferences: { nodes: [{ merged: true, mergeCommit: { oid: 'merged' }, baseRefName: 'main', repository: { nameWithOwner: 'other/repo' } }], pageInfo: { hasNextPage: false } } } } } }]
  })
  const rows = await mod.createProvider(config, f.run).discover()
  assert.equal(rows[1].merged, true)
  assert.match(rows[1].exclusion, /repository/)
})
test('GitHub asynchronous merge queue returns pending for reconciliation', async () => {
  let requested = false
  const f = fake((file, a) => {
    if (a[1] === 'view') return { ...pr, mergeStateStatus: requested ? 'BLOCKED' : 'CLEAN' }
    if (a[1] === 'merge') { requested = true; return '' }
  })
  const result = await mod.createProvider(config, f.run).merge(task, 'abc')
  assert.equal(result.merged, false)
})
test('Already merged GitHub PR adoption does not resurrect its branch', async () => {
  const f = fake((file, a) => {
    if (a[1]?.startsWith('repos/owner/repo/pulls?')) return [[{ number: 9, html_url: pr.url, state: 'closed', merged_at: '2026-01-01', body: 'Closes #1', head: { ref: task.branch, repo: { full_name: config.repository } }, base: { ref: 'main' } }]]
    if (a[1] === 'view') return { ...pr, state: 'MERGED', mergeCommit: { oid: 'merged' } }
  })
  const result = await mod.createProvider(config, f.run).ensurePullRequest({ ...task, ticket: { id: '1' } })
  assert.equal(result.merged, true)
  assert.ok(!f.calls.some(x => x.file === 'git' && x.args[0] === 'push'))
})
test('GitHub refuses same-name branch PR from another repository', async () => {
  const f = fake((file, a) => a[1] === 'view' ? { ...pr, isCrossRepository: true } : undefined)
  await assert.rejects(() => mod.createProvider(config, f.run).merge(task, 'abc'), /identity|policies/)
  assert.ok(!f.calls.some(x => x.args[1] === 'merge'))
})
test('Azure uses configured process completed state after a confirmed merge', async () => {
  let closed = false
  const f = fake((file, a) => {
    if (a[0] === 'repos' && a[2] === 'show') return { ...azurePr, status: 'completed', lastMergeCommit: { commitId: 'merged' } }
    if (a[0] === 'boards' && a[2] === 'show') return { fields: { 'System.WorkItemType': 'Custom Task' } }
    if (a.includes('workItemTypeStates')) return { value: [{ name: 'Accepted', category: 'Completed' }] }
    if (a[2] === 'update') { assert.ok(a.includes('Accepted')); closed = true; return {} }
  })
  await mod.createProvider(azureConfig, f.run).close(azureTask)
  assert.equal(closed, true)
})
test('Azure claim checks every comment page before rejecting foreign ownership', async () => {
  const f = fake((file, a) => {
    if (a.includes('comments')) { assert.equal(a[a.indexOf('--api-version') + 1], '7.1-preview'); return a.includes('continuationToken=next') ? { comments: [{ text: 'darkingdoom-claim:foreign' }] } : { comments: [], continuationToken: 'next' } }
  })
  await assert.rejects(() => mod.createProvider(azureConfig, f.run).claim({ id: '1' }, 'mine'), /another/)
  assert.ok(!f.calls.some(x => x.args.includes('update')))
})
test('command cancellation aborts a running process', async () => {
  const { runCommand } = await import('../lib/captain/commands.js')
  const controller = new AbortController()
  const running = runCommand(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { signal: controller.signal, timeoutMs: 1000 })
  setTimeout(() => controller.abort(), 50)
  await assert.rejects(running, /abort/i)
})
test('Azure completion uses workflow category, retains acceptance details and caches metadata', async () => {
  const f = fake((file, a) => {
    if (a[1] === 'query') return [{ id: 1 }, { id: 2 }, { id: 3 }]
    if (a[2] === 'show') {
      const id = Number(a[a.indexOf('--id') + 1])
      return { id, fields: { 'System.Title': 'T', 'System.State': ['Accepted', 'Resolved', 'Removed'][id - 1], 'System.IterationPath': 'M1', 'System.WorkItemType': 'Custom Task', 'System.Description': 'Description', 'Microsoft.VSTS.Common.AcceptanceCriteria': 'Must preserve records', 'System.ReproSteps': 'Open and retry' } }
    }
    if (a.includes('workItemTypeStates')) return { value: [{ name: 'Accepted', category: 'Completed' }, { name: 'Resolved', category: 'Resolved' }, { name: 'Removed', category: 'Removed' }] }
  })
  const rows = await mod.createProvider(azureConfig, f.run).discover()
  assert.deepEqual(rows.map(x => x.state), ['closed', 'open', 'open'])
  assert.equal(rows[0].merged, false)
  assert.match(rows[0].body, /Must preserve records/)
  assert.match(rows[0].body, /Open and retry/)
  assert.equal(f.calls.filter(x => x.args.includes('workItemTypeStates')).length, 1)
})
test('Azure external-project dependency is visible but cannot become a dispatch candidate', async () => {
  const f = fake((file, a) => {
    if (a[1] === 'query') return [{ id: 1 }]
    if (a[2] === 'show') {
      const id = Number(a[a.indexOf('--id') + 1])
      return { id, fields: { 'System.Title': 'T', 'System.State': 'Active', 'System.IterationPath': 'M1', 'System.TeamProject': id === 1 ? 'P' : 'Other' }, relations: id === 1 ? [{ rel: 'System.LinkTypes.Dependency-Reverse', url: 'https://dev.azure.com/org/_apis/wit/workItems/2' }] : [] }
    }
  })
  const rows = await mod.createProvider(azureConfig, f.run).discover()
  assert.deepEqual(rows[0].predecessors, ['2'])
  assert.match(rows[1].exclusion, /project/)
  assert.ok(f.calls.some(x => x.args.includes('project=Other') && x.args.includes('workItemTypeStates')))
})
test('Azure merged PR only proves delivery for Completed work item category', async () => {
  const f = fake((file, a) => {
    if (a[1] === 'query') return [{ id: 1 }, { id: 2 }]
    if (a[0] === 'boards' && a[2] === 'show') {
      const id = Number(a[a.indexOf('--id') + 1])
      return { id, fields: { 'System.Title': 'T', 'System.State': id === 1 ? 'Accepted' : 'Resolved', 'System.IterationPath': 'M1' }, relations: [{ rel: 'ArtifactLink', attributes: { name: 'Pull Request' }, url: 'vstfs:///Git/PullRequestId/project-id%2Frepo-id%2F9' }] }
    }
    if (a.includes('workItemTypeStates')) return { value: [{ name: 'Accepted', category: 'Completed' }, { name: 'Resolved', category: 'Resolved' }] }
    if (a[0] === 'repos' && a[2] === 'show') return { status: 'completed', lastMergeCommit: { commitId: 'merge' }, targetRefName: 'refs/heads/main', repository: { id: 'repo-id', project: { id: 'project-id' } } }
  })
  const rows = await mod.createProvider(azureConfig, f.run).discover()
  assert.deepEqual(rows.map(x => x.merged), [true, false])
})
test('provider cancellation interrupts discovery and rejects subsequent commands before spawning', async () => {
  let calls = 0
  let entered
  const started = new Promise(resolve => { entered = resolve })
  const runner = async (_file, _args, options) => {
    calls++
    assert.ok(options.signal instanceof AbortSignal)
    entered()
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('Provider command aborted')), { once: true }))
  }
  const provider = mod.createProvider(config, runner)
  assert.equal(typeof provider.cancel, 'function')
  const discovery = provider.discover()
  await started
  provider.cancel()
  await assert.rejects(discovery, /abort/i)
  await assert.rejects(() => provider.discover(), /abort|cancel/i)
  assert.equal(calls, 1)
})

test('GitHub recognizes the leading follow-up declarations from issues 426 and 427', async () => {
  for (const [body, predecessor] of [
    ['Severity: P2. M2 session-boundary follow-up from the HTTP hardening group (#401).', '401'],
    ['Follow-up to #423, explicitly deferred by the coordinating owner delegation on 2026-10-08.', '423'],
    ['Severity: P2. Session-boundary follow-up from the hardening group (#401).', '401'],
    ['**Follow-up to:** #423\n\nRelated: #999', '423'],
  ]) {
    const f = fake((_file, args) => {
      if (args[1] === 'repos/owner/repo/issues?state=all&per_page=100') return [[issue(426, { body })]]
      if (args[1] === `repos/owner/repo/issues/${predecessor}`) return issue(Number(predecessor), { milestone: null })
      if (args[1]?.includes('/dependencies/')) return [[]]
    })
    const rows = await mod.createProvider(config, f.run).discover()
    assert.deepEqual(rows.find(x => x.id === '426').predecessors, [predecessor])
  }
})

test('GitHub rejects issue metadata with inconsistent URL and number identity', async () => {
  const f = fake((_file, args) => args[1]?.includes('/dependencies/') ? [[]] : [[issue(426, { html_url: 'https://github.com/owner/repo/issues/999' })]])
  await assert.rejects(() => mod.createProvider(config, f.run).discover(), /identity|URL/)
})

test('GitHub follow-up parsing ignores historical, negated, independent, code and foreign references', async () => {
  for (const body of [
    'Related: #401\nHistorical follow-up to #423.',
    'A historical summary.\n\nSeverity: P2. M2 session-boundary follow-up from the group (#401).',
    'Not a follow-up to #423; this is independent.',
    'Follow-up to #423, but independent and does not depend on its implementation.',
    'Follow-up to #423 is historical only; no prerequisite.',
    '```text\nDepends on #401\nFollow-up to #423\n```',
    '~~~text\nBlocked by: #401\n~~~',
    'Follow-up to AB#423, other/repo#401, other/repo-#999.',
    'The related design mentions a follow-up to #423.',
  ]) {
    const f = fake((_file, args) => {
      if (args[1] === 'repos/owner/repo/issues?state=all&per_page=100') return [[issue(426, { body })]]
      const requested = /^repos\/owner\/repo\/issues\/(\d+)$/.exec(args[1])
      if (requested) return issue(Number(requested[1]), { milestone: null })
      if (args[1]?.includes('/dependencies/')) return [[]]
    })
    const rows = await mod.createProvider(config, f.run).discover()
    assert.deepEqual(rows[0].predecessors, [], body)
    assert.equal(rows.length, 1, body)
  }
})

test('GitHub preserves authoritative predecessors while ignoring a trailing independent explanation', async () => {
  for (const body of [
    'Predecessors: #401 (historical implementation is still unmerged)',
    'Depends on #401; #427 is otherwise independent',
    'Blocked by #401 (requires its historical implementation)',
    'Predecessors: #401; #402',
  ]) {
    const f = fake((_file, args) => {
      if (args[1] === 'repos/owner/repo/issues?state=all&per_page=100') return [[issue(426, { body })]]
      const requested = /^repos\/owner\/repo\/issues\/(\d+)$/.exec(args[1])
      if (requested) return issue(Number(requested[1]), { milestone: null })
      if (args[1]?.includes('/dependencies/')) return [[]]
    })
    const rows = await mod.createProvider(config, f.run).discover()
    assert.deepEqual(rows[0].predecessors, body.endsWith('; #402') ? ['401', '402'] : ['401'], body)
  }
})

function githubDependencyFixture(items, dependencies = {}, closing = []) {
  return fake((_file, args) => {
    const path = args[1]
    const direct = /^repos\/owner\/repo\/issues\/(\d+)$/.exec(path)
    if (direct) return items[direct[1]] ?? Promise.reject(new Error('HTTP 404 missing issue'))
    const native = /issues\/(\d+)\/dependencies\/blocked_by/.exec(path)
    if (native) return [dependencies[native[1]] ?? []]
    if (path === 'graphql') return [{ data: { repository: { issue: { closedByPullRequestsReferences: { nodes: closing, pageInfo: { hasNextPage: false } } } } } }]
  })
}
const closingProof = { merged: true, mergeCommit: { oid: 'merged-parent' }, baseRefName: 'main', repository: { nameWithOwner: 'owner/repo' } }
const githubTask = id => ({ ...task, ticket: { id: String(id) } })

test('GitHub verifies fresh native predecessors outside milestone/query selection', async () => {
  const f = githubDependencyFixture({ 426: issue(426), 401: issue(401, { milestone: null }) }, { 426: [issue(401, { state: 'closed' })] })
  const provider = mod.createProvider({ ...config, query: 'label:ready' }, f.run)
  assert.match(await provider.verifyDependencies(githubTask(426)), /401/)
  assert.ok(f.calls.some(x => x.args[1] === 'repos/owner/repo/issues/401'))
  assert.ok(!f.calls.some(x => /issues\?|search\/issues/.test(x.args[1])))
})

test('GitHub fresh dependency proof accepts merged closure and completed decisions but refuses manual closure', async () => {
  for (const [parent, refs, allowed] of [
    [issue(423, { state: 'closed', milestone: null }), [closingProof], true],
    [issue(423, { state: 'closed', state_reason: 'completed', labels: [{ name: 'kind:decision' }], milestone: null }), [], true],
    [issue(423, { state: 'closed', milestone: null }), [], false],
    [issue(423, { state: 'closed', milestone: null }), [{ ...closingProof, baseRefName: 'other' }], false],
  ]) {
    const f = githubDependencyFixture({ 427: issue(427, { body: 'Follow-up to #423.' }), 423: parent }, {}, refs)
    const result = await mod.createProvider(config, f.run).verifyDependencies(githubTask(427))
    if (allowed) assert.equal(result, undefined)
    else assert.match(result, /423/)
  }
})

test('GitHub fresh dependency verification resolves transitive prerequisites and fails closed on unavailable metadata', async () => {
  const f = githubDependencyFixture({ 427: issue(427, { body: 'Follow-up to #423.' }), 423: issue(423, { milestone: null, body: 'Depends on #401' }), 401: issue(401, { milestone: null }) })
  assert.match(await mod.createProvider(config, f.run).verifyDependencies(githubTask(427)), /401|423/)
  assert.ok(f.calls.some(x => x.args[1] === 'repos/owner/repo/issues/401'))
  for (const child of [undefined, issue(427, { state: 'unknown' }), issue(999)]) {
    const broken = githubDependencyFixture(child ? { 427: child } : {})
    assert.match(await mod.createProvider(config, broken.run).verifyDependencies(githubTask(427)), /missing|unknown|identity|verify|verification/i)
  }
  const unavailable = fake(() => Promise.reject(new Error('HTTP 403')))
  assert.match(await mod.createProvider(config, unavailable.run).verifyDependencies(githubTask(1)), /403/)
})

test('GitHub dependency verification refetches changed predecessors on every call and requires native endpoint success', async () => {
  const items = { 427: issue(427), 423: issue(423, { state: 'closed', milestone: null }) }
  const f = githubDependencyFixture(items, { 427: [issue(423)] }, [closingProof])
  const provider = mod.createProvider(config, f.run)
  assert.equal(await provider.verifyDependencies(githubTask(427)), undefined)
  items[423] = issue(423, { milestone: null })
  assert.match(await provider.verifyDependencies(githubTask(427)), /423/)
  const unavailable = fake((_file, args) => args[1] === 'repos/owner/repo/issues/1' ? issue(1) : Promise.reject(new Error('HTTP 403 dependency endpoint')))
  assert.match(await mod.createProvider(config, unavailable.run).verifyDependencies(githubTask(1)), /403/)
})

const workItem = (id, extra = {}) => ({ id, fields: { 'System.Title': `T${id}`, 'System.State': 'Active', 'System.IterationPath': id === 1 ? 'M1' : 'Outside', 'System.WorkItemType': 'Task', 'System.TeamProject': 'P' }, relations: [], ...extra })
const azurePredecessor = id => ({ rel: 'System.LinkTypes.Dependency-Reverse', url: `https://dev.azure.com/org/_apis/wit/workItems/${id}` })
const azureClosingLink = { rel: 'ArtifactLink', attributes: { name: 'Pull Request' }, url: 'vstfs:///Git/PullRequestId/project-id%2Frepo-id%2F9' }
function azureDependencyFixture(items, pr = { status: 'completed', lastMergeCommit: { commitId: 'merged-parent' }, targetRefName: 'refs/heads/main', repository: { id: 'repo-id', project: { id: 'project-id' } } }) {
  return fake((_file, args) => {
    if (args[0] === 'boards' && args[2] === 'show') return items[args[args.indexOf('--id') + 1]] ?? Promise.reject(new Error('HTTP 404 missing work item'))
    if (args[0] === 'repos' && args[2] === 'show') return pr
  })
}

test('Azure verifies fresh transitive predecessors without milestone/query scans', async () => {
  const f = azureDependencyFixture({ 1: workItem(1, { relations: [azurePredecessor(2)] }), 2: workItem(2, { relations: [azurePredecessor(3)] }), 3: workItem(3) })
  assert.match(await mod.createProvider({ ...azureConfig, query: 'selected child only' }, f.run).verifyDependencies(azureTask), /2|3/)
  assert.ok(f.calls.some(x => x.args.includes('--id') && x.args[x.args.indexOf('--id') + 1] === '3'))
  assert.ok(!f.calls.some(x => x.args.includes('query') || x.args.includes('wiql')))
})

test('Azure fresh dependency proof requires completed workflow and actual merged artifact, or completed decision', async () => {
  for (const [state, tags, links, pr, allowed] of [
    ['Closed', '', [azureClosingLink], undefined, true],
    ['Closed', 'kind:decision', [], undefined, true],
    ['Closed', '', [], undefined, false],
    ['Active', '', [azureClosingLink], undefined, false],
    ['Closed', '', [azureClosingLink], { status: 'completed', lastMergeCommit: { commitId: 'merged-parent' }, targetRefName: 'refs/heads/other', repository: { id: 'repo-id', project: { id: 'project-id' } } }, false],
  ]) {
    const parent = workItem(2)
    parent.fields['System.State'] = state
    parent.fields['System.Tags'] = tags
    parent.relations = links
    const f = azureDependencyFixture({ 1: workItem(1, { relations: [azurePredecessor(2)] }), 2: parent }, pr)
    const result = await mod.createProvider(azureConfig, f.run).verifyDependencies(azureTask)
    if (allowed) assert.equal(result, undefined)
    else assert.match(result, /2/)
  }
})

test('Azure fresh dependency verification fails closed on missing child, unknown state, and identity mismatch', async () => {
  const unknown = workItem(1)
  unknown.fields['System.State'] = 'Unmapped'
  for (const child of [undefined, unknown, workItem(999)]) {
    const f = azureDependencyFixture(child ? { 1: child } : {})
    assert.match(await mod.createProvider(azureConfig, f.run).verifyDependencies(azureTask), /missing|category|identity|verify|verification/i)
  }
})

test('Azure fresh dependency verification refuses unreadable or cross-organization predecessors', async () => {
  const missing = azureDependencyFixture({ 1: workItem(1, { relations: [azurePredecessor(2)] }) })
  assert.match(await mod.createProvider(azureConfig, missing.run).verifyDependencies(azureTask), /404/)
  const foreign = azureDependencyFixture({ 1: workItem(1, { relations: [{ ...azurePredecessor(2), url: 'https://dev.azure.com/other-org/_apis/wit/workItems/2' }] }) })
  assert.match(await mod.createProvider(azureConfig, foreign.run).verifyDependencies(azureTask), /Cross-organization/)
})

test('GitHub optionally discovers null and absent milestone roots without seeding other milestones or PRs', async () => {
  const seeds = [issue(1), issue(2, { milestone: null }), issue(3, { milestone: undefined }), issue(4, { milestone: { title: 'Other' } }), issue(5, { milestone: null, pull_request: {} })]
  const f = fake((_file, args) => {
    if (args[1] === 'repos/owner/repo/issues?state=all&per_page=100') return [seeds]
    if (/dependencies\/blocked_by/.test(args[1])) return [[]]
  })
  assert.deepEqual((await mod.createProvider(config, f.run).discover()).map(t => t.id), ['1'])
  const rows = await mod.createProvider({ ...config, includeUnmilestoned: true }, f.run).discover()
  assert.deepEqual(rows.map(t => [t.id, t.milestone]), [['1', 'M1'], ['2', ''], ['3', '']])
  assert.deepEqual((await mod.createProvider({ ...config, milestones: [], includeUnmilestoned: true }, f.run).discover()).map(t => t.id), ['2', '3'])
})

test('GitHub query retains transitive out-of-selection predecessors and foreign repository hard exclusions', async () => {
  const foreign = issue(4, { html_url: 'https://github.com/other/repo/issues/4', milestone: null })
  const f = fake((_file, args) => {
    if (args[1]?.startsWith('search/issues?')) return [{ total_count: 1, incomplete_results: false, items: [issue(1)] }]
    if (args[1] === 'repos/owner/repo/issues?state=all&per_page=100') return [[issue(1, { body: 'Depends on #2' })]]
    if (args[1] === 'repos/owner/repo/issues/2') return issue(2, { milestone: null, body: 'Depends on #3' })
    if (args[1] === 'repos/owner/repo/issues/3') return issue(3, { milestone: { title: 'Other' } })
    if (args[1] === 'repos/owner/repo/issues/3/dependencies/blocked_by?per_page=100') return [[foreign]]
    if (/dependencies\/blocked_by/.test(args[1])) return [[]]
  })
  const rows = await mod.createProvider({ ...config, query: 'label:ready', includeUnmilestoned: true }, f.run).discover()
  assert.deepEqual(rows.map(t => t.id), ['1', '2', '3', 'other/repo#4'])
  for (const id of ['2', '3']) {
    assert.equal(rows.find(t => t.id === id).exclusion, undefined)
    assert.equal(rows.find(t => t.id === id).selectionExclusion, 'Does not match configured query')
  }
  assert.equal(rows.find(t => t.id === 'other/repo#4').exclusion, 'Dependency belongs to another repository')
})

test('Azure optional unmilestoned seeds include project root iterations and normalize absent iterations', async () => {
  const f = fake((_file, args) => {
    if (args[1] === 'query') {
      const wiql = args[args.indexOf('--wiql') + 1]
      return /'P'\)/.test(wiql) ? [{ id: 1 }, { id: 2 }, { id: 3 }] : [{ id: 1 }]
    }
    if (args[2] === 'show') {
      const id = Number(args[args.indexOf('--id') + 1])
      const item = workItem(id)
      item.fields['System.IterationPath'] = id === 1 ? 'M1' : id === 2 ? 'P' : undefined
      return item
    }
  })
  assert.deepEqual((await mod.createProvider(azureConfig, f.run).discover()).map(t => t.id), ['1'])
  const rows = await mod.createProvider({ ...azureConfig, includeUnmilestoned: true }, f.run).discover()
  assert.deepEqual(rows.map(t => [t.id, t.milestone]), [['1', 'M1'], ['2', ''], ['3', '']])
  assert.ok(rows.every(t => !t.exclusion))
})

test('Azure preserves an explicitly selected project root as a legacy milestone', async () => {
  const f = fake((_file, args) => {
    if (args[1] === 'query') return [{ id: 1 }]
    if (args[2] === 'show') {
      const item = workItem(1)
      item.fields['System.IterationPath'] = 'P'
      return item
    }
  })
  for (const includeUnmilestoned of [undefined, false, true]) {
    const rows = await mod.createProvider({ ...azureConfig, milestones: ['P'], includeUnmilestoned }, f.run).discover()
    assert.equal(rows[0].milestone, 'P')
    assert.equal(rows[0].exclusion, undefined)
  }
})

test('Azure empty selected milestone scope skips intake instead of emitting invalid WIQL', async () => {
  const f = fake(() => [])
  assert.deepEqual(await mod.createProvider({ ...azureConfig, milestones: [], includeUnmilestoned: false }, f.run).discover(), [])
  assert.equal(f.calls.length, 0)
  await mod.createProvider({ ...azureConfig, milestones: [], includeUnmilestoned: true }, f.run).discover()
  const wiql = f.calls[0].args[f.calls[0].args.indexOf('--wiql') + 1]
  assert.match(wiql, /\[System.IterationPath\] IN \('P'\)/)
})

test('Azure query leaves outside-milestone ancestors selectable by policy and preserves foreign and Removed hard exclusions', async () => {
  const items = { 1: workItem(1, { relations: [azurePredecessor(2)] }), 2: workItem(2, { relations: [azurePredecessor(3), azurePredecessor(4)] }), 3: workItem(3), 4: workItem(4) }
  items[3].fields['System.TeamProject'] = 'Other'
  items[4].fields['System.State'] = 'Removed'
  const f = fake((_file, args) => {
    if (args[1] === 'query') return [{ id: 1 }]
    if (args[2] === 'show') return items[args[args.indexOf('--id') + 1]]
    if (args.includes('workItemTypeStates')) return { value: [{ name: 'Active', category: 'InProgress' }, { name: 'Removed', category: 'Removed' }] }
  })
  const rows = await mod.createProvider({ ...azureConfig, query: 'selected root', includeUnmilestoned: true }, f.run).discover()
  assert.deepEqual(rows.map(t => t.id), ['1', '2', '3', '4'])
  assert.equal(rows[1].exclusion, undefined)
  assert.equal(rows[1].selectionExclusion, 'Does not match configured query')
  assert.equal(rows[2].exclusion, 'Dependency belongs to another project')
  assert.equal(rows[3].exclusion, 'Work item workflow category is Removed')
})

test('GitHub unmilestoned follow-ups omit milestone assignment and retry native dependency linking', async () => {
  let created
  let linked = false
  const f = fake((_file, args) => {
    if (args[1] === 'repos/owner/repo/issues?state=all&per_page=100') return [created ? [created] : []]
    if (args[1]?.startsWith('repos/owner/repo/milestones?')) return [[]]
    if (args[1] === 'repos/owner/repo/issues' && args.includes('POST')) {
      assert.ok(!args.some(arg => arg.startsWith('milestone=')))
      created = issue(8, { milestone: null, body: args.find(arg => arg.startsWith('body=')).slice(5) })
      return created
    }
    if (args[1] === 'repos/owner/repo/issues/8/dependencies/blocked_by?per_page=100') return [linked ? [issue(1)] : []]
    if (args[1] === 'repos/owner/repo/issues/1') return issue(1)
    if (args[1] === 'repos/owner/repo/issues/8/dependencies/blocked_by') { linked = true; return issue(1) }
  })
  const provider = mod.createProvider({ ...config, includeUnmilestoned: true }, f.run)
  const input = { title: 'Next', body: 'Details', milestone: '', predecessors: [] }
  assert.equal(await provider.createFollowup({ ...task, ticket: { id: '1' } }, input), '8')
  assert.equal(await provider.createFollowup({ ...task, ticket: { id: '1' } }, input), '8')
  assert.equal(f.calls.filter(call => call.args[1] === 'repos/owner/repo/issues' && call.args.includes('POST')).length, 1)
  assert.equal(f.calls.filter(call => call.args[1]?.endsWith('/blocked_by') && call.args.includes('POST')).length, 1)
})

test('Azure unmilestoned follow-ups target project root iteration and retain native predecessor links', async () => {
  const f = fake((_file, args) => {
    if (args[1] === 'query') return []
    if (args[2] === 'create') {
      assert.equal(args[args.indexOf('--iteration') + 1], 'P')
      return { id: 8 }
    }
    if (args[2] === 'show') return { id: 8, relations: [] }
    if (args[2] === 'relation') return {}
  })
  assert.equal(await mod.createProvider({ ...azureConfig, includeUnmilestoned: true }, f.run).createFollowup(azureTask, { title: 'Next', body: 'Details', milestone: '', predecessors: ['2'] }), '8')
  assert.deepEqual(f.calls.filter(call => call.args[2] === 'relation').map(call => call.args[call.args.indexOf('--target-id') + 1]), ['1', '2'])
})

test('Both providers reject unmilestoned follow-ups when the intake option is disabled', async () => {
  for (const providerConfig of [config, azureConfig]) {
    const f = fake(() => [])
    await assert.rejects(() => mod.createProvider(providerConfig, f.run).createFollowup({ ...task, ticket: { id: '1' } }, { title: 'Next', body: 'Details', milestone: '', predecessors: [] }), /milestone/i)
    assert.equal(f.calls.length, 0)
  }
})
