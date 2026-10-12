import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const runtime = await import('../lib/captain/runtime.js').catch(() => ({}))
const worktrees = await import('../lib/captain/worktrees.js').catch(() => ({}))
const review = await import('../lib/captain/review.js').catch(() => ({}))
const config = { remote: 'origin', targetBranch: 'main', workerPreset: 'standard', maxTeamMembers: 2, verifyCommands: [], maxTaskMinutes: 5 }
const task = extra => ({ id: 't1', sessionId: 'session-1', branch: 'delivery/t1', startedAt: new Date().toISOString(), ticket: { id: '1', title: 'Fix', body: 'Acceptance', milestone: 'M1', predecessors: [] }, ...extra })
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const runner = async (file, args, opts) => execFileSync(file, args, { cwd: opts?.cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
async function repo(t) {
  const root = await mkdtemp(join(tmpdir(), 'captain-runtime-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  git(root, 'init', '-b', 'main'); git(root, 'config', 'user.email', 'test@example.invalid'); git(root, 'config', 'user.name', 'Test')
  await writeFile(join(root, 'a.txt'), 'base'); git(root, 'add', '.'); git(root, 'commit', '-m', 'base'); git(root, 'remote', 'add', 'origin', root)
  return root
}
test('runtime factory exists', () => assert.equal(typeof runtime.createRuntime, 'function'))
test('prepare fetches target, creates isolated branch and idempotently adopts exact worktree', async t => {
  const root = await repo(t); const item = task({ worktree: join(root, 'work') }); const cfg = { ...config, workspace: root }
  await worktrees.prepareWorktree(item, cfg, runner)
  assert.equal(item.baseSha, git(root, 'rev-parse', 'main'))
  assert.equal(git(item.worktree, 'branch', '--show-current'), item.branch)
  assert.equal(git(item.worktree, 'check-ignore', '.agent-teams/team/state.json'), '.agent-teams/team/state.json')
  await worktrees.prepareWorktree(item, cfg, runner)
  git(item.worktree, 'switch', '-c', 'wrong')
  await assert.rejects(worktrees.prepareWorktree(item, cfg, runner), /branch|worktree/)
})
const manifest = (head = 'head', base = 'base') => ({ status: 'complete', comments: [], manifest: { schema_version: 'ocr.run-manifest/v1', operation: 'review', terminal_state: 'complete', input: { mode: 'range', resolved_base: base, resolved_head: head }, coverage: { selected: [{ item_id: 'a', path: 'a.txt' }], completed: [{ item_id: 'a', path: 'a.txt' }], reused: [], failed: [], waived: [] } } })
test('existing prepared worktree resume validates local identity without a remote fetch',async t=>{
  const root=await repo(t),item=task({worktree:join(root,'work')}),cfg={...config,workspace:root}
  await worktrees.prepareWorktree(item,cfg,runner)
  const offline=async(file,args,opts)=>{if(args[0]==='fetch')throw new Error('Remote unavailable');return runner(file,args,opts)}
  await worktrees.prepareWorktree(item,cfg,offline)
  git(item.worktree,'switch','-c','wrong')
  await assert.rejects(worktrees.prepareWorktree(item,cfg,offline),/unexpected branch/)
})
test('OCR parser requires exact input, all changed paths and complete coverage', () => {
  assert.deepEqual(review.parseOcrReport(JSON.stringify(manifest()), 'head', 'base', ['a.txt']), [])
  for (const value of [{}, { ...manifest(), status: 'partial' }, { ...manifest(), manifest: { ...manifest().manifest, coverage: { ...manifest().manifest.coverage, completed: [] } } }]) {
    assert.throws(() => review.parseOcrReport(JSON.stringify(value), 'head', 'base', ['a.txt']))
  }
  assert.throws(() => review.parseOcrReport(JSON.stringify(manifest()), 'other', 'base', ['a.txt']))
  assert.throws(() => review.parseOcrReport(JSON.stringify(manifest()), 'head', 'base', ['a.txt', 'b.txt']))
})
test('review verifies immutable committed head and rejects verification modifications', async t => {
  const root = await repo(t); const item = task({ worktree: root, baseSha: git(root, 'rev-parse', 'HEAD') })
  await writeFile(join(root, 'a.txt'), 'changed'); git(root, 'add', '.'); git(root, 'commit', '-m', 'change')
  git(root, 'branch', 'target', item.baseSha)
  const fake = async (file, args, options) => {
    if (file === 'ocr') { const path = args[args.indexOf('--output') + 1]; await writeFile(path, JSON.stringify(manifest(git(root, 'rev-parse', 'HEAD'), item.baseSha))); return '' }
    return runner(file, args, options)
  }
  const phases = []
  const result = await review.reviewTask(item, { ...config, workspace: root, targetBranch: 'target' }, fake, async phase => phases.push(phase))
  assert.equal(result.passed, true, result.report)
  assert.equal(result.baseSha, item.baseSha)
  assert.deepEqual(phases, ['testing', 'review'])
  const dirty = await review.reviewTask(item, { ...config, workspace: root, targetBranch: 'target', verifyCommands: ['echo changed >> a.txt'] }, fake)
  assert.equal(dirty.passed, false)
})
function host() {
  const calls = []; const hooks = []; const agents = new Map(); const workspaces = new Map()
  const permissions = { resolve: () => ({ sandbox: 'danger-full-access', approval: 'never' }), set: (session, preset) => calls.push(['permission', session.id, preset]) }
  const ctx = {
    workspaceRegistry: { create: async(path,title)=>{calls.push(['workspace',path,title]);let workspace=workspaces.get(path);if(!workspace){workspace={id:`workspace-${workspaces.size+1}`,path,title};workspaces.set(path,workspace)}return workspace} },
    get: name => name === 'permissionPresets' ? permissions : ctx[name],
    tools: { get: () => ({}), schemas: () => [{ name: 'hindsight_recall' }, { name: 'ego_browser' }] },
    agents: { get: id => agents.get(id), list: () => [...agents.values()], isOwnedBy: () => false },
    subagents: { drainContinuableDescendants: async roots => calls.push(['permanent-drain', roots[0].id]), listChildren: async()=>[{id:'owned-child',mode:'continuable'}], drainContinuableChildren: async(parent,ids)=>calls.push(['drain',parent.id,ids]) },
    sessionController: {
      inspect: async id=>({meta:{id},inheritedEventCount:0,events:[...agents.get(id)?.events??[],...agents.get(id)?.title?[{type:'session/title',data:{title:agents.get(id).title,source:{kind:'user'}}}]:[]]}),
      rename: async req=>{calls.push(['rename',req]);agents.get(req.sessionId).title=req.title},
      create: async req => { calls.push(['create', req]);const cwd=req.cwd??[...workspaces.values()].find(w=>w.id===req.workspaceId)?.path; if (!agents.has(req.sessionId)) agents.set(req.sessionId, { id: req.sessionId, status: 'idle', session: { id: req.sessionId, header: { cwd } }, ctx: { on: (name, fn) => hooks.push([name, fn]) }, cancel: () => calls.push(['cancel']), whenIdle: async () => calls.push(['idle']) }); return { sessionId: req.sessionId } },
      resolveAgent: async id => ({ agent: agents.get(id) }),
      prompt: async req => { const agent=agents.get(req.sessionId);if(agent.events?.some(e=>e.type==='user/message'&&e.data.source?.rpcId===req.requestId))return {accepted:true};calls.push(['prompt', req]);agent.events??=[];agent.events.push({type:'user/message',data:{content:req.content,source:{kind:'user',rpcId:req.requestId}}});agent.status = 'running'; return { accepted: true } },
    },
  }
  return { ctx, calls, hooks, agents, workspaces }
}
async function seedTeam(root, h, item, archived = true) {
  const team = { id: 'original-team', name: 'Original team', captainSessionId: item.sessionId, description: `Delivery task ${item.id}`, createdAt: Date.now(), taskSeq: 1, phase: 'running', members: [{ id: 'member-session', name: 'implementer', joinedAt: Date.now(), status: archived ? 'removed' : 'idle' }], tasks: [{ id: 't1', subject: 'Implementation', assignee: 'implementer', status: 'completed', dependencies: [], output: 'Implemented and tested', createdAt: Date.now(), updatedAt: Date.now() }] }
  const dir = join(root, '.agent-teams', ...(archived ? ['archive'] : []), team.id)
  await mkdir(dir, { recursive: true }); await writeFile(join(dir, 'team.json'), JSON.stringify(team))
  await writeFile(join(root, '.git', 'info', 'exclude'), '/.agent-teams/\n')
  await h.ctx.sessionController.create({ sessionId: item.sessionId, cwd: root })
  h.agents.get(item.sessionId).events = [
    {type:'tool/call',seq:1,data:{callId:'create-original',name:'agent_teams_create',arguments:JSON.stringify({name:team.name,approval:'automatic',description:team.description})}},
    {type:'tool/result',seq:2,sourceEventSeqs:[1],data:{message:{toolCallId:'create-original',isError:false,content:[]},meta:{team_id:team.id,team_name:team.name,captain_session_id:item.sessionId}}},
  ]
  return team
}
test('worker is ordinary root, permissions precede prompt, genuine activity and descendants drain', async () => {
  const h = host(); const rt = runtime.createRuntime(h.ctx, { runner: async () => '' })
  await rt.start(task({ worktree: '/worker' }), { config })
  const created=h.calls.find(c=>c[0]==='create')[1]
  assert.equal(h.calls[0][0],'workspace');assert.equal(created.workspaceId,'workspace-1');assert.equal(created.cwd,undefined);assert.equal(created.parentAgent,undefined)
  assert.equal(h.agents.get('session-1').session.header.cwd,'/worker')
  assert.ok(h.calls.findIndex(c=>c[0]==='permission')<h.calls.findIndex(c=>c[0]==='prompt'))
  const prompt = h.calls.find(c=>c[0]==='prompt')[1].content[0].text
  assert.match(prompt, /agent_teams_create/); assert.match(prompt, /automatic/); assert.match(prompt, /darkingdoom_report/)
  assert.equal(await rt.isRunning('session-1'), true)
  h.agents.get('session-1').status = 'idle'; assert.equal(await rt.isRunning('session-1'), false)
  await rt.send('session-1', 'Repair findings'); assert.equal(await rt.isRunning('session-1'), true)
  await rt.stop('session-1'); assert.deepEqual(h.calls.slice(-4).map(x => x[0]), ['cancel', 'drain', 'cancel', 'idle'])
  await rt.send('session-1', 'Repair after review'); assert.equal(h.calls.at(-1)[0], 'prompt')
})

test('task workspace registration is idempotent and preserves existing sessions and customized titles',async()=>{
  const h=host(),rt=runtime.createRuntime(h.ctx),item=task({worktree:'/worker'})
  await rt.registerWorkspace(item,{config:{...config,workspace:'/TrucX'}})
  assert.equal(item.workspaceId,'workspace-1');assert.equal(h.workspaces.get('/worker').title,'TrucX · #1')
  assert.equal(h.agents.get(item.sessionId).title,'#1 Fix')
  h.agents.get(item.sessionId).title='My investigation'
  await rt.registerWorkspace(item,{config:{...config,workspace:'/TrucX'}})
  assert.equal(h.workspaces.size,1);assert.equal(h.agents.size,1);assert.equal(h.agents.get(item.sessionId).title,'My investigation')
  h.agents.get(item.sessionId).title='You are the DarKingDoom Plugin — my custom title'
  await rt.registerWorkspace(item,{config:{...config,workspace:'/TrucX'}})
  assert.equal(h.agents.get(item.sessionId).title,'You are the DarKingDoom Plugin — my custom title')
  delete h.agents.get(item.sessionId).title
  h.agents.get(item.sessionId).events=[{type:'session/title',data:{title:'You are the DarKingDoom Plugin worker',source:{kind:'fallback'}}}]
  await rt.registerWorkspace(item,{config:{...config,workspace:'/TrucX'}})
  assert.equal(h.agents.get(item.sessionId).title,'#1 Fix')
  assert.equal(h.calls.some(c=>c[0]==='prompt'||c[0]==='permission'),false)
})

test('workspace registration failures cannot start an ungrouped worker',async()=>{
  const h=host(),rt=runtime.createRuntime(h.ctx)
  h.ctx.workspaceRegistry.create=async()=>{throw new Error('Workspace unavailable')}
  await assert.rejects(rt.start(task({worktree:'/worker'}),{config}),/Workspace unavailable/)
  assert.equal(h.calls.some(c=>c[0]==='create'||c[0]==='prompt'),false)
})
test('captain notifications recover an ordinary session through the controller', async () => {
  const h = host(); const rt = runtime.createRuntime(h.ctx)
  await h.ctx.sessionController.create({ sessionId: 'captain', cwd: '/captain' })
  await rt.send('captain', 'Question from worker')
  assert.equal(h.calls.at(-1)[1].content[0].text, 'Question from worker')
})

test('assignment text renders ticket newlines and recovery never repeats the full ticket',async()=>{
  const h=host(),rt=runtime.createRuntime(h.ctx),item=task({worktree:'/worker'});item.ticket.body='Acceptance line one\r\nAcceptance line two'
  await rt.start(item,{config});const first=h.calls.find(c=>c[0]==='prompt')[1]
  assert.match(first.content[0].text,/Acceptance line one\nAcceptance line two/)
  assert.equal(first.content[0].text.includes('\\r\\n'),false)
  h.agents.get(item.sessionId).status='idle';item.lastWakeAt='recovery-1'
  await rt.start(item,{config});const second=h.calls.filter(c=>c[0]==='prompt').at(-1)[1]
  assert.notEqual(second.requestId,first.requestId);assert.match(second.content[0].text,/darkingdoom.resume/)
  assert.equal(second.content[0].text.includes('Acceptance line one'),false)
  delete item.assignmentDelivered;h.agents.get(item.sessionId).status='idle';item.lastWakeAt='recovery-2'
  await runtime.createRuntime(h.ctx).start(item,{config})
  assert.equal(h.calls.filter(c=>c[0]==='prompt'&&c[1].content[0].text.includes('Acceptance line one')).length,1)
})

test('human solved checkpoint authorizes one normal retry without clarification and consumes its receipt after admission',async()=>{
  const h=host(),rt=runtime.createRuntime(h.ctx),item=task({worktree:'/worker',assignmentDelivered:true,pendingHumanRetry:{at:'human-1',reason:'solved',previousBlocker:'Prior WAIT'}})
  await rt.start(item,{config})
  const prompt=h.calls.filter(c=>c[0]==='prompt').at(-1)[1].content[0].text
  assert.match(prompt,/human-retry/);assert.match(prompt,/Do not ask.*what.*solved/i);assert.match(prompt,/once/i);assert.match(prompt,/not.*passing.*gate/i)
  assert.equal(item.pendingHumanRetry,undefined)
  h.agents.get(item.sessionId).status='idle';item.lastWakeAt='idle-recovery';await rt.start(item,{config})
  assert.doesNotMatch(h.calls.filter(c=>c[0]==='prompt').at(-1)[1].content[0].text,/human-retry/)
})

test('blocked-worker guidance requires actual scoped main-session original team and completed delegated diagnostics',async t=>{
  const root=await repo(t),h=host(),rt=runtime.createRuntime(h.ctx),run={id:'diagnostic-run',captainSessionId:'captain',config:{...config,workspace:root}}
  await assert.rejects(rt.assertCaptainDiagnostics(run),/ORIGINAL AgentTeams/)
  const team=await seedTeam(root,h,task({id:run.id,sessionId:'captain',worktree:root}))
  team.description+=' DarKingDoom diagnostics'
  const file=join(root,'.agent-teams','archive',team.id,'team.json')
  await writeFile(file,JSON.stringify(team));await rt.assertCaptainDiagnostics(run)
  const memberId=team.members[0].id;team.members[0].id='';await writeFile(file,JSON.stringify(team))
  await assert.rejects(rt.assertCaptainDiagnostics(run),/completed diagnostic/)
  team.members[0].id=memberId
  team.tasks[0].status='pending';await writeFile(file,JSON.stringify(team))
  await assert.rejects(rt.assertCaptainDiagnostics(run),/completed diagnostic/)
})

test('diagnostic status exposes loaded code and archived team evidence without waking sessions',async t=>{
  const root=await repo(t),h=host(),rt=runtime.createRuntime(h.ctx),item=task({worktree:root})
  await seedTeam(root,h,item,true);const before=h.calls.length
  const evidence=await rt.evidence({config:{...config,workspace:root},tasks:[item]})
  assert.match(evidence.host.moduleSha256,/^[a-f0-9]{64}$/);assert.equal(evidence.workers[0].team.state,'archived')
  assert.equal(evidence.workers[0].team.id,'original-team');assert.equal(evidence.workers[0].archiveCause,'Not recorded; do not infer a historical cause')
  assert.equal(h.calls.length,before)
})

test('host shutdown quiesces workers while retaining the original active team graph',async t=>{
  const root=await repo(t),h=host(),item=task({worktree:root});await seedTeam(root,h,item,false)
  const rt=runtime.createRuntime(h.ctx);await rt.restore(item,{config:{...config,workspace:root}})
  h.ctx.tools.execute=async()=>{throw new Error('Shutdown must not archive the retained team')}
  await rt.stop(item.sessionId,'shutdown')
  const evidence=await rt.evidence({config:{...config,workspace:root},tasks:[item]})
  assert.equal(evidence.workers[0].team.state,'active');assert.ok(h.calls.some(c=>c[0]==='drain'))
})

test('inbox clearing failure still aborts the active phase and attempts owned child cleanup',async()=>{
  const h=host(),rt=runtime.createRuntime(h.ctx),item=task({worktree:'/worker'})
  await rt.restore(item,{config})
  let aborted=0
  h.agents.get(item.sessionId).cancel=(_cause,options)=>{if(!options?.keepInbox)throw new Error('inbox projection registration is not active');aborted++}
  await assert.rejects(rt.stop(item.sessionId,'shutdown'),/inbox projection registration/)
  assert.ok(aborted>0);assert.ok(h.calls.some(c=>c[0]==='drain'));assert.ok(h.calls.some(c=>c[0]==='idle'))
})

test('live lifecycle evidence reads the exact registered agent inbox without changing it',async()=>{
  const h=host(),rt=runtime.createRuntime(h.ctx),item=task({worktree:'/worker'})
  await rt.restore(item,{config});const agent=h.agents.get(item.sessionId)
  agent.inbox={nextTurn:[],nextStep:[]}
  const evidence=await rt.evidence({config,tasks:[item]})
  assert.equal(evidence.workers[0].lifecycle.inbox.readable,true);assert.equal(evidence.workers[0].lifecycle.sessionMatches,true)
  Object.defineProperty(agent.inbox,'nextTurn',{get(){throw new Error('projection registration is not active')}})
  const unhealthy=await rt.evidence({config,tasks:[item]})
  assert.equal(unhealthy.workers[0].lifecycle.inbox.readable,false);assert.match(unhealthy.workers[0].lifecycle.inbox.error,/not active/)
})

test('healthy native request admission retains old shutdown errors in history while preserving gate failures',async()=>{
  for(const message of ['Shutdown incomplete: prior inbox registration failure','Verification finding remains unresolved']) {
    const h=host(),rt=runtime.createRuntime(h.ctx),item=task({worktree:'/worker',phases:[],error:message})
    await rt.restore(item,{config});h.agents.get(item.sessionId).inbox={nextTurn:[],nextStep:[]}
    await rt.start(item,{config})
    if(message.startsWith('Shutdown incomplete:')){assert.equal(item.error,undefined);assert.ok(item.phases.some(p=>p.note?.includes(message)))}else assert.equal(item.error,message)
  }
})
test('idle root counts as active while owned descendants work', async () => {
  const h = host(); const rt = runtime.createRuntime(h.ctx)
  await rt.start(task({ worktree: '/worker' }), { config })
  h.agents.get('session-1').status = 'idle'
  h.agents.set('member', { id: 'member', status: 'running' })
  h.ctx.agents.isOwnedBy = (id, owner) => id === 'member' && owner.id === 'session-1'
  assert.equal(await rt.isRunning('session-1'), true)
})
test('preflight refuses missing original tools and mismatched full-access preset', async () => {
  const h = host(); const rt = runtime.createRuntime(h.ctx, { runner: async () => '--output --format' })
  h.ctx.tools.get = () => undefined
  await assert.rejects(rt.preflight(config), /Original AgentTeams/)
  h.ctx.tools.get = () => ({})
  h.ctx.get('permissionPresets').resolve = () => ({ sandbox: 'workspace-write', approval: 'ask' })
  await assert.rejects(rt.preflight(config), /Full-access/)
})
test('scoped team admission enforces automatic capped inline plan', async () => {
  const h = host(); const rt = runtime.createRuntime(h.ctx)
  await rt.start(task({ worktree: '/worker' }), { config })
  const gate = h.hooks.find(([name]) => name === 'tools/pre-execute')[1]
  const call = args => gate({ name: 'agent_teams_create', arguments: args }, async () => ({ kind: 'allow' }))
  assert.equal((await call({ approval: 'required', plan: { members: [{}] } })).kind, 'deny')
  assert.equal((await call({ approval: 'automatic', plan: { members: [{}, {}, {}] } })).kind, 'deny')
  assert.equal((await call({ approval: 'automatic', description: 'Delivery task t1', plan: { members: [{}] } })).kind, 'allow')
})

test('an explicitly raised resource snapshot updates already-configured team admission guards',async()=>{
  const h=host(),rt=runtime.createRuntime(h.ctx),item=task({worktree:'/worker',assignmentConfig:{...config,maxTeamMembers:2}})
  await rt.start(item,{config})
  const gate=h.hooks.find(([name])=>name==='tools/pre-execute')[1]
  const call=count=>gate({name:'agent_teams_create',arguments:{approval:'automatic',description:'Delivery task t1',plan:{members:Array.from({length:count},()=>({}))}}},async()=>({kind:'allow'}))
  assert.equal((await call(3)).kind,'deny')
  item.assignmentConfig={...item.assignmentConfig,maxTeamMembers:5}
  assert.equal((await call(5)).kind,'allow');assert.equal((await call(6)).kind,'deny')
})
test('review fails closed on malformed output or a timeout', async t => {
  const root = await repo(t); const item = task({ worktree: root, baseSha: git(root, 'rev-parse', 'HEAD') })
  git(root, 'branch', 'target', item.baseSha)
  await writeFile(join(root, 'a.txt'), 'changed'); git(root, 'add', '.'); git(root, 'commit', '-m', 'change')
  for (const mode of ['bad-json', 'timeout']) {
    const fake = async (file, args, options) => {
      if (file === 'ocr') { if (mode === 'timeout') throw new Error('OCR timed out'); await writeFile(args[args.indexOf('--output') + 1], '{}'); return '' }
      return runner(file, args, options)
    }
    assert.equal((await review.reviewTask(item, { ...config, workspace: root, targetBranch: 'target' }, fake)).passed, false)
  }
})
test('restore attaches recovered policy without waking a new turn', async () => {
  const h = host(); const rt = runtime.createRuntime(h.ctx)
  await rt.restore(task({ worktree: '/worker' }), { config })
  assert.equal(h.calls.some(call => call[0] === 'prompt'), false)
  await rt.send('session-1', 'Answer received')
  assert.equal(h.calls.at(-1)[0], 'prompt')
})
test('OCR renamed files cover both old and new changed paths', () => {
  const value = manifest()
  value.manifest.coverage.selected[0].old_path = 'old.txt'
  value.manifest.coverage.completed[0].old_path = 'old.txt'
  assert.deepEqual(review.parseOcrReport(JSON.stringify(value), 'head', 'base', ['a.txt', 'old.txt']), [])
})
test('worker inherits the captains next model selection rather than stale constructor options', async () => {
  const h = host(); const rt = runtime.createRuntime(h.ctx)
  h.agents.set('captain', { id: 'captain', options: { provider: 'old', model: 'old' } })
  h.ctx.sessionController.projections = async () => ({ values: { modelSelection: { next: { provider: 'selected', model: 'new', reasoningEffort: 'high' } } } })
  h.ctx.sessionController.selectModel = async req => h.calls.push(['model', req])
  await rt.start(task({ worktree: '/worker' }), { config, captainSessionId: 'captain' })
  assert.equal(h.calls.find(call => call[0] === 'model')[1].provider, 'selected')
})
test('review rejects commit replacement during OCR and current target movement', async t => {
  const root = await repo(t); const item = task({ worktree: root, baseSha: git(root, 'rev-parse', 'HEAD') })
  git(root, 'branch', 'target', item.baseSha)
  await writeFile(join(root, 'a.txt'), 'changed'); git(root, 'add', '.'); git(root, 'commit', '-m', 'change')
  for (const mode of ['head', 'target']) {
    const fake = async (file, args, options) => {
      if (file === 'ocr') {
        const reviewed = git(root, 'rev-parse', 'HEAD')
        await writeFile(args[args.indexOf('--output') + 1], JSON.stringify(manifest(reviewed, item.baseSha)))
        if (mode === 'head') git(root, 'commit', '--allow-empty', '-m', 'raced')
        else git(root, 'branch', '-f', 'target', reviewed)
        return ''
      }
      return runner(file, args, options)
    }
    const result = await review.reviewTask(item, { ...config, workspace: root, targetBranch: 'target' }, fake)
    assert.equal(result.passed, false)
    assert.match(result.findings.join(' '), /changed during review|Target branch moved/)
  }
})
test('stop aborts the active review command and returns a failed gate', async t => {
  const root = await repo(t); const item = task({ worktree: root, baseSha: git(root, 'rev-parse', 'HEAD') })
  git(root, 'branch', 'target', item.baseSha)
  await writeFile(join(root, 'a.txt'), 'changed'); git(root, 'add', '.'); git(root, 'commit', '-m', 'change')
  let entered
  const ready = new Promise(resolve => { entered = resolve })
  const h = host()
  await seedTeam(root, h, item)
  const fake = async (file, args, options) => {
    if (file === 'ocr') return new Promise((resolve, reject) => {
      entered()
      if (!options.signal) { reject(new Error('Missing cancellation signal')); return }
      options.signal.addEventListener('abort', () => reject(new Error('Review cancelled')), { once: true })
    })
    return runner(file, args, options)
  }
  const rt = runtime.createRuntime(h.ctx, { runner: fake })
  const result = rt.review(item, { ...config, workspace: root, targetBranch: 'target' })
  await ready
  await rt.stop(item.sessionId)
  const value = await result
  assert.equal(value.passed, false)
  assert.match(value.findings.join(' '), /Review cancelled/)
})
test('cached passed review stays valid only for clean exact head and current target', async t => {
  const root = await repo(t); const base = git(root, 'rev-parse', 'HEAD')
  git(root, 'branch', 'target', base)
  await writeFile(join(root, 'a.txt'), 'changed'); git(root, 'add', '.'); git(root, 'commit', '-m', 'change')
  const head = git(root, 'rev-parse', 'HEAD')
  const item = task({ worktree: root, baseSha: base })
  const cfg = { ...config, workspace: root, targetBranch: 'target' }
  const h = host(); await seedTeam(root, h, item)
  const rt = runtime.createRuntime(h.ctx, { runner })
  const evidence = { passed: true, headSha: head, baseSha: base, report: '{}', findings: [] }
  assert.equal(await rt.isReviewCurrent(item, cfg, evidence), true)
  assert.equal(await rt.isReviewCurrent(item, cfg, { ...evidence, passed: false }), false)
  assert.equal(await rt.isReviewCurrent(item, cfg, { ...evidence, baseSha: undefined }), false)
  await writeFile(join(root, 'a.txt'), 'dirty')
  assert.equal(await rt.isReviewCurrent(item, cfg, evidence), false)
  git(root, 'restore', 'a.txt')
  git(root, 'commit', '--allow-empty', '-m', 'new head')
  assert.equal(await rt.isReviewCurrent(item, cfg, evidence), false)
  git(root, 'branch', '-f', 'target', head)
  assert.equal(await rt.isReviewCurrent(item, cfg, { ...evidence, headSha: git(root, 'rev-parse', 'HEAD') }), false)
})
test('required browser integration is Tencent BrowserSkill, including lazy skill registration', async () => {
  const h = host(); const rt = runtime.createRuntime(h.ctx, { runner: async (_file, args) => args[0] === '--version' ? '1.12.13' : '--output --format' })
  h.ctx.tools.get = name => name.startsWith('agent_teams_') || name === 'skill' ? {} : undefined
  await assert.rejects(rt.preflight({ ...config, requireBrowser: true }), /BrowserSkill/)
  h.ctx.skills = { list: async () => [{ name: 'ego-browser', invocation: { modelInvocable: true } }, { name: 'browser-skill', invocation: { modelInvocable: true } }], get: async name => ({ content: name === 'browser-skill' ? 'Tencent BrowserSkill browser_session browser_inspect' : 'Ego browser instructions' }) }
  await rt.preflight({ ...config, requireBrowser: true })
  assert.match(runtime.workerPrompt(task({}), { ...config, requireBrowser: true }), /Tencent BrowserSkill/)
})
test('runtime review fails before OCR without completed durable original team evidence', async t => {
  const root = await repo(t); const h = host(); const item = task({ worktree: root })
  let calls = 0
  const rt = runtime.createRuntime(h.ctx, { runner: async () => { calls++; return '' } })
  const result = await rt.review(item, { ...config, workspace: root })
  assert.equal(result.passed, false); assert.match(result.findings.join(' '), /AgentTeams/); assert.equal(calls, 0)
})
test('stop calls installed original archive tool and does not use fork mutation helpers', async t => {
  const root = await repo(t); const h = host(); const item = task({ worktree: root })
  const team = await seedTeam(root, h, item, false)
  h.ctx.tools.execute = async exec => {
    const gate = h.hooks.find(([name]) => name === 'tools/pre-execute')?.[1]
    if (gate) assert.equal((await gate({ ...exec, rootCallId: exec.callId }, async () => ({ kind: 'allow' }))).kind, 'allow')
    h.calls.push(['installed-tool', exec.name])
    await mkdir(join(root, '.agent-teams', 'archive'), { recursive: true })
    await rename(join(root, '.agent-teams', team.id), join(root, '.agent-teams', 'archive', team.id))
    return { isError: false, value: { deleted: true }, content: [] }
  }
  const rt = runtime.createRuntime(h.ctx)
  await rt.restore(item, { config })
  await rt.stop(item.sessionId)
  assert.ok(h.calls.some(call => call[0] === 'installed-tool' && call[1] === 'agent_teams_delete'))
})
test('original team evidence rejects unfinished scope and disk state without its creation event', async t => {
  const root = await repo(t); const h = host(); const item = task({ worktree: root })
  const team = await seedTeam(root, h, item)
  const rt = runtime.createRuntime(h.ctx, { runner: async () => { throw new Error('Should not run OCR or Git') } })
  team.tasks.push({ ...team.tasks[0], id: 't2', status: 'pending' })
  await writeFile(join(root, '.agent-teams', 'archive', team.id, 'team.json'), JSON.stringify(team))
  assert.match((await rt.review(item, config)).findings.join(' '), /scope is incomplete/)
  h.agents.get(item.sessionId).events = []
  assert.match((await rt.review(item, config)).findings.join(' '), /creation evidence/)
})
test('stop safely handles session creation not yet published', async () => {
  const h = host(); const rt = runtime.createRuntime(h.ctx)
  let publish
  const original = h.ctx.sessionController.create
  h.ctx.sessionController.create = req => new Promise(resolve => { publish = async () => { await original(req); resolve({ sessionId: req.sessionId }) } })
  const starting = rt.restore(task({ worktree: '/worker' }), { config })
  await rt.stop('session-1')
  await publish(); await starting
  await rt.stop('session-1')
  assert.ok(h.calls.some(call => call[0] === 'drain'))
})
test('stop quiesces an in-flight original creation before discovering and archiving its team',async t=>{
  const root=await repo(t), h=host(), item=task({worktree:root})
  const rt=runtime.createRuntime(h.ctx)
  await rt.restore(item,{config})
  let written=false
  h.agents.get(item.sessionId).whenIdle=async()=>{
    h.calls.push(['idle'])
    if(!written){written=true;const dir=join(root,'.agent-teams','late-team');await mkdir(dir,{recursive:true});await writeFile(join(dir,'team.json'),JSON.stringify({id:'late-team',name:'late-team',captainSessionId:item.sessionId,createdAt:Date.now(),taskSeq:0,members:[],tasks:[]}))}
  }
  h.ctx.tools.execute=async exec=>{h.calls.push(['installed-tool',exec.name]);return {isError:false,content:[]}}
  await rt.stop(item.sessionId)
  assert.ok(h.calls.some(call=>call[0]==='installed-tool'&&call[1]==='agent_teams_delete'))
  assert.ok(h.calls.findIndex(call=>call[0]==='idle')<h.calls.findIndex(call=>call[0]==='drain'))
  assert.equal(h.calls.some(call=>call[0]==='permanent-drain'),false)
})
test('failed original archive still drains the root and descendants', async t => {
  const root = await repo(t); const h = host(); const item = task({ worktree: root })
  await seedTeam(root, h, item, false)
  h.ctx.tools.execute = async () => ({ isError: true, error: { message: 'archive failed' }, content: [] })
  const rt = runtime.createRuntime(h.ctx); await rt.restore(item, { config })
  await assert.rejects(rt.stop(item.sessionId), /archive failed/)
  assert.ok(h.calls.some(call => call[0] === 'drain'))
  assert.equal(h.calls.at(-1)[0], 'idle')
})
test('stop uses registered run_code transport when PTC hides direct original tool calls', async t => {
  const root = await repo(t); const h = host(); const item = task({ worktree: root })
  const team = await seedTeam(root, h, item, false)
  const names = []
  h.ctx.tools.execute = async exec => {
    names.push(exec.name)
    const gate = h.hooks.find(([name]) => name === 'tools/pre-execute')[1]
    assert.equal((await gate({ ...exec, rootCallId: exec.callId }, async () => ({ kind: 'allow' }))).kind, 'allow')
    if (exec.name === 'agent_teams_delete') return { isError: true, error: { message: 'PTC only', info: { code: 'UNKNOWN_TOOL' } }, content: [] }
    assert.equal(exec.arguments.code, 'await tools.agent_teams_delete({})')
    await mkdir(join(root, '.agent-teams', 'archive'), { recursive: true })
    await rename(join(root, '.agent-teams', team.id), join(root, '.agent-teams', 'archive', team.id))
    return { isError: false, value: null, content: [] }
  }
  const rt = runtime.createRuntime(h.ctx); await rt.restore(item, { config }); await rt.stop(item.sessionId)
  assert.deepEqual(names, ['agent_teams_delete', 'run_code'])
})
