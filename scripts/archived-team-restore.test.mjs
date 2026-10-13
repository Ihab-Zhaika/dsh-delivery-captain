import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rename, rm, symlink, realpath, lstat } from 'node:fs/promises'
import { existsSync, readdirSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, relative, basename, isAbsolute, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { registerArchivedTeamRestoreTool, ARCHIVED_TEAM_RESTORE_SCHEMA, ARCHIVED_TEAM_RESTORE_RECEIPT } from '../src/archived-team-restore.ts'
import { readTeam, readArchivedTeam } from '../src/state.ts'
import { TEAM_TOOL_NAMES, CAPTAIN_TOOL_NAMES, MEMBER_TOOL_NAMES } from '../src/tool-names.ts'
import { installTeamCapabilities } from '../src/capabilities.ts'

async function inventory(directory) {
  const files = []
  async function walk(dir, prefix = '') {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name), relative = prefix + entry.name
      if (entry.isDirectory()) { files.push([relative + '/', 'directory']); await walk(path, relative + '/') }
      else files.push([relative, createHash('sha256').update(await readFile(path)).digest('hex')])
    }
  }
  await walk(directory); return files
}
async function fixture(t) {
  const workspace = await mkdtemp(join(tmpdir(), 'agent-teams-restore-'))
  t.after(async () => {
    const target = resolve(workspace), temporaryRoot = await realpath(tmpdir()), canonical = await realpath(target), stat = await lstat(target)
    const path = relative(temporaryRoot, canonical), pathKey = value => process.platform === 'win32' ? value.toLowerCase() : value
    assert.equal(isAbsolute(target), true)
    assert.equal(pathKey(canonical), pathKey(target), 'cleanup target may not resolve through a symlink')
    assert.ok(path !== '' && !isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`) && !path.includes(sep), 'cleanup must stay directly within the canonical temporary root')
    assert.ok(basename(target).startsWith('agent-teams-restore-'), 'cleanup requires the exact owned fixture prefix')
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'cleanup target must be the real fixture directory')
    await rm(target, { recursive: true, force: true })
  })
  const stateRoot = join(workspace, '.agent-teams'), teamId = 'delivery-453-windows-ownership', archive = join(stateRoot, 'archive', teamId)
  await mkdir(join(archive, 'inbox'), { recursive: true })
  await mkdir(join(archive, 'evidence'), { recursive: true })
  const team = { id: teamId, name: teamId, description: 'Original delivery team', captainSessionId: 'original-captain', phase: 'running', halted: true, haltedAt: 777, escalated: true, createdAt: 1, taskSeq: 47,
    members: Array.from({ length: 5 }, (_, i) => ({ id: `retired-${i}`, name: `member-${i}`, status: 'removed', joinedAt: 1, role: 'Original role' })),
    tasks: Array.from({ length: 47 }, (_, i) => ({ id: `task-${i + 1}`, subject: `Original task ${i + 1}`, description: 'Original scope', status: ['completed', 'failed', 'cancelled'][i % 3], dependencies: i ? [`task-${i}`] : [], assignee: `member-${i % 5}`, attempt: 3, attemptId: `original-attempt-${i}`, output: `Original evidence ${i}`, createdAt: 1, updatedAt: 2 })),
  }
  await writeFile(join(archive, 'team.json'), JSON.stringify(team, null, 2) + '\n')
  await writeFile(join(archive, 'inbox', 'captain.jsonl'), '{"original":"mailbox","message":"preserved"}\n')
  await writeFile(join(archive, 'evidence', 'opaque.bin'), Buffer.from([0, 255, 1, 254]))
  await writeFile(join(stateRoot, 'retired-members.json'), JSON.stringify(team.members.map(m => m.id)))
  const definitions = new Map(), modelRequests = []
  const agent = { id: 'original-captain', session: { id: 'original-captain', header: { id: 'original-captain', cwd: workspace } } }
  const ctx = { tools: { register(definition) { definitions.set(definition.name, definition); return () => definitions.delete(definition.name) } }, agents: { get: id => id === agent.id ? agent : undefined }, subagents: new Proxy({}, { get: (_target, name) => () => { modelRequests.push(name); throw new Error('No model lifecycle is authorized') } }) }
  registerArchivedTeamRestoreTool(ctx, { stateDir: '.agent-teams' })
  const execute = (args = { team_id: teamId, reason: 'Human approved the same original assignment continuation.' }, caller = agent, signal = new AbortController().signal) => definitions.get('agent_teams_restore').execute(args, { agent: caller, signal })
  return { workspace, stateRoot, archive, teamId, team, ctx, agent, definitions, modelRequests, execute }
}

test('public restore registration has required schema, owner-only exposure and index wiring', async t => {
  const f = await fixture(t), definition = f.definitions.get('agent_teams_restore')
  assert.ok(definition)
  assert.deepEqual(definition.parameters.required, ['team_id', 'reason'])
  assert.ok(definition.output)
  assert.ok(TEAM_TOOL_NAMES.includes('agent_teams_restore'))
  assert.ok(CAPTAIN_TOOL_NAMES.includes('agent_teams_restore'))
  assert.equal(MEMBER_TOOL_NAMES.includes('agent_teams_restore'), false)
  assert.match(await readFile(new URL('../src/index.ts', import.meta.url), 'utf8'), /registerArchivedTeamRestoreTool\(ctx,/)
  assert.equal(ARCHIVED_TEAM_RESTORE_SCHEMA, 'agent-teams/archive-restore/v1')
})

test('restore copies genuine archive atomically preserving all 47 tasks, five removed members, retired IDs and bytes', async t => {
  const f = await fixture(t), before = await inventory(f.archive), retired = await readFile(join(f.stateRoot, 'retired-members.json'))
  const result = await f.execute()
  assert.equal(result.status, 'restored'); assert.equal(result.team_id, f.teamId); assert.equal(result.schema_version, ARCHIVED_TEAM_RESTORE_SCHEMA)
  assert.equal(result.tasks, 47); assert.equal(result.members, 5); assert.equal(result.work_started, false)
  assert.deepEqual(await readTeam(f.stateRoot, f.teamId), await readArchivedTeam(f.stateRoot, f.teamId))
  assert.deepEqual(await inventory(f.archive), before)
  const copied = await inventory(join(f.stateRoot, f.teamId))
  assert.deepEqual(copied.filter(([path]) => path !== ARCHIVED_TEAM_RESTORE_RECEIPT), before)
  assert.deepEqual(await readFile(join(f.stateRoot, 'retired-members.json')), retired)
  assert.deepEqual(f.modelRequests, [])
  assert.match(f.definitions.get('agent_teams_restore').output.render({}, result)[0].text, /not.*(?:resume|start)|no.*(?:resume|start)/i)
})

test('same receipt and unchanged archive permit strict idempotency without resetting subsequent native task changes', async t => {
  const f = await fixture(t), first = await f.execute(), receipt = await readFile(join(f.stateRoot, f.teamId, ARCHIVED_TEAM_RESTORE_RECEIPT))
  const active = await readTeam(f.stateRoot, f.teamId); active.tasks[0].output = 'Later API evidence retained'
  await writeFile(join(f.stateRoot, f.teamId, 'team.json'), JSON.stringify(active))
  const second = await f.execute()
  assert.equal(second.status, 'already_restored'); assert.equal(second.archive_fingerprint, first.archive_fingerprint)
  assert.deepEqual(await readFile(join(f.stateRoot, f.teamId, ARCHIVED_TEAM_RESTORE_RECEIPT)), receipt)
  assert.equal((await readTeam(f.stateRoot, f.teamId)).tasks[0].output, 'Later API evidence retained')
  assert.deepEqual(f.modelRequests, [])
})

for (const [name, change] of [
  ['foreign owner', async f => { const team = { ...f.team, captainSessionId: 'another-owner' }; await writeFile(join(f.archive, 'team.json'), JSON.stringify(team)) }],
  ['fork caller', async f => { f.agent.id = 'fork'; f.agent.session.id = 'fork'; f.agent.session.header.id = 'fork'; f.agent.session.header.parentSession = 'original-captain' }],
  ['mismatched native session', async f => { f.agent.session.id = 'other-session' }],
  ['mismatched native header', async f => { f.agent.session.header.id = 'other-session' }],
  ['unregistered original caller', async f => { f.ctx.agents.get = () => undefined }],
  ['alternate owning team', async f => { const team = { ...f.team, id: 'other-team', name: 'other-team' }; await mkdir(join(f.stateRoot, team.id)); await writeFile(join(f.stateRoot, team.id, 'team.json'), JSON.stringify(team)) }],
  ['unreceipted active copy', async f => { await mkdir(join(f.stateRoot, f.teamId)); await writeFile(join(f.stateRoot, f.teamId, 'team.json'), JSON.stringify(f.team)) }],
  ['empty existing destination', async f => { await mkdir(join(f.stateRoot, f.teamId)) }],
  ['absent retired identity', async f => { await writeFile(join(f.stateRoot, 'retired-members.json'), '[]') }],
]) test(`restore rejects ${name} without altering archive or requesting models`, async t => {
  const f = await fixture(t); await change(f); const before = await inventory(f.archive)
  await assert.rejects(f.execute())
  assert.deepEqual(await inventory(f.archive), before); assert.deepEqual(f.modelRequests, [])
})

test('wrong native workspace cannot substitute another worktree archive', async t => {
  const f = await fixture(t); f.agent.session.header.cwd = join(f.workspace, 'different-worktree'); await mkdir(f.agent.session.header.cwd)
  await assert.rejects(f.execute(), /archive|directory|workspace|ENOENT/i)
  assert.equal(await readTeam(f.stateRoot, f.teamId), undefined)
})

test('forged calling object cannot reuse the original captain ID', async t => {
  const f = await fixture(t)
  await assert.rejects(f.execute(undefined, { ...f.agent }), /original|registered|captain/i)
})

test('unsafe IDs and state directory escape reject before file operations', async t => {
  const f = await fixture(t)
  for (const id of ['../outside', '..', '', 'archive', 'C:\\outside', '/outside']) await assert.rejects(f.execute({ team_id: id, reason: 'Explicit restoration reason' }))
  registerArchivedTeamRestoreTool(f.ctx, { stateDir: '../outside' })
  await assert.rejects(f.execute(), /directory|safe|contain|workspace/i)
  assert.equal(await readTeam(f.stateRoot, f.teamId), undefined)
})

test('archive drift after restore rejects idempotent adoption and preserves the active graph', async t => {
  const f = await fixture(t); await f.execute(); const active = await readFile(join(f.stateRoot, f.teamId, 'team.json'))
  await writeFile(join(f.archive, 'inbox', 'captain.jsonl'), 'New archive generation')
  await assert.rejects(f.execute(), /drift|changed|fingerprint|receipt/i)
  assert.deepEqual(await readFile(join(f.stateRoot, f.teamId, 'team.json')), active)
})

test('malformed or foreign restore receipt cannot authorize active adoption', async t => {
  const f = await fixture(t); await f.execute()
  const path = join(f.stateRoot, f.teamId, ARCHIVED_TEAM_RESTORE_RECEIPT), receipt = JSON.parse(await readFile(path, 'utf8'))
  receipt.captain_session_id = 'another-owner'; await writeFile(path, JSON.stringify(receipt))
  await assert.rejects(f.execute(), /receipt|owner|captain/i)
})

test('directory junction inside archive is rejected without following or deleting its target', async t => {
  const f = await fixture(t), outside = join(f.workspace, 'foreign-owner'); await mkdir(outside); await writeFile(join(outside, 'keep.txt'), 'Foreign bytes')
  await symlink(outside, join(f.archive, 'escape'), process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(f.execute(), /symlink|junction|link|contain/i)
  assert.equal(await readFile(join(outside, 'keep.txt'), 'utf8'), 'Foreign bytes')
  assert.equal(await readTeam(f.stateRoot, f.teamId), undefined)
})

test('archive-root junction and active-destination junction reject before any recursive operation', async t => {
  const f = await fixture(t), outside = join(f.workspace, 'foreign-owner'); await mkdir(outside); await writeFile(join(outside, 'keep.txt'), 'Foreign bytes')
  await symlink(outside, join(f.stateRoot, f.teamId), process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(f.execute(), /symlink|junction|link/i)
  assert.equal(await readFile(join(outside, 'keep.txt'), 'utf8'), 'Foreign bytes')
})

test('pre-aborted restore neither publishes active state nor wakes anyone', async t => {
  const f = await fixture(t), controller = new AbortController(); controller.abort(new Error('Cancelled restore'))
  await assert.rejects(f.execute(undefined, undefined, controller.signal), /Cancelled|abort/i)
  assert.equal(await readTeam(f.stateRoot, f.teamId), undefined); assert.deepEqual(f.modelRequests, [])
})

test('concurrent repeats publish one active state with the same archive provenance', async t => {
  const f = await fixture(t), results = await Promise.all([f.execute(), f.execute()])
  assert.deepEqual(results.map(r => r.status).sort(), ['already_restored', 'restored'])
  assert.equal(results[0].archive_fingerprint, results[1].archive_fingerprint)
  assert.deepEqual(f.modelRequests, [])
})

test('archive-root junction rejects before archived bytes can be adopted', async t => {
  const f = await fixture(t), original = join(f.stateRoot, 'archive-original')
  await rename(join(f.stateRoot, 'archive'), original)
  await symlink(original, join(f.stateRoot, 'archive'), process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(f.execute(), /symlink|junction|link/i)
  assert.equal(await readTeam(f.stateRoot, f.teamId), undefined)
  assert.equal(JSON.parse(await readFile(join(original, f.teamId, 'team.json'), 'utf8')).tasks.length, 47)
})

test('loss of exact original native captain during staging rejects publication and cleans only its own stage', async t => {
  const f = await fixture(t), before = await inventory(f.archive); let calls = 0
  f.ctx.agents.get = () => ++calls < 3 ? f.agent : undefined
  await assert.rejects(f.execute(), /registered|captain/i)
  assert.equal(await readTeam(f.stateRoot, f.teamId), undefined)
  assert.deepEqual(await inventory(f.archive), before)
  const staging = join(f.stateRoot, '.archive-restore-staging')
  assert.deepEqual(await readdir(staging), [])
})

for (const kind of ['stage payload', 'archive payload', 'prepared receipt']) test(`final native caller check cannot publish ${kind} drift after receipt preparation`, async t => {
  const f = await fixture(t), before = await inventory(f.archive); let changed = false
  f.ctx.agents.get = () => {
    const parent = join(f.stateRoot, '.archive-restore-staging')
    if (!changed && existsSync(parent)) for (const slot of readdirSync(parent)) {
      const stage = join(parent, slot, f.teamId), receipt = join(stage, ARCHIVED_TEAM_RESTORE_RECEIPT)
      if (!existsSync(receipt)) continue
      changed = true
      if (kind === 'prepared receipt') {
        const value = JSON.parse(readFileSync(receipt, 'utf8')); value.reason = 'Foreign rewritten reason after receipt preparation.'
        writeFileSync(receipt, JSON.stringify(value))
      } else writeFileSync(join(kind === 'stage payload' ? stage : f.archive, 'evidence', 'opaque.bin'), 'Changed after prepared receipt existed')
    }
    return f.agent
  }
  await assert.rejects(f.execute(), /changed|drift|receipt/i)
  assert.equal(changed, true)
  assert.equal(await readTeam(f.stateRoot, f.teamId), undefined)
  if (kind !== 'archive payload') assert.deepEqual(await inventory(f.archive), before)
  assert.deepEqual(f.modelRequests, [])
})

test('post-publication drift retains uncertain active bytes and rejects later idempotent adoption', async t => {
  const f = await fixture(t), active = join(f.stateRoot, f.teamId), before = await inventory(f.archive); let changed = false
  f.ctx.agents.get = () => {
    if (!changed && existsSync(join(active, ARCHIVED_TEAM_RESTORE_RECEIPT))) {
      changed = true; writeFileSync(join(active, 'evidence', 'opaque.bin'), 'Uncertain published bytes')
    }
    return f.agent
  }
  await assert.rejects(f.execute(), /uncertain|unverified|changed|drift/i)
  assert.equal(changed, true)
  assert.equal(await readFile(join(active, 'evidence', 'opaque.bin'), 'utf8'), 'Uncertain published bytes')
  assert.equal(JSON.parse(await readFile(join(active, ARCHIVED_TEAM_RESTORE_RECEIPT), 'utf8')).publication_state, 'prepared')
  f.ctx.agents.get = () => f.agent
  await assert.rejects(f.execute(), /prepared|verified|receipt/i)
  assert.deepEqual(await inventory(f.archive), before)
  assert.deepEqual(f.modelRequests, [])
})

for (const kind of ['archive', 'receipt', 'owner']) test(`idempotent restore rejects ${kind} drift from the final native identity check`, async t => {
  const f = await fixture(t); await f.execute(); let calls = 0
  f.ctx.agents.get = () => {
    if (++calls === 3) {
      if (kind === 'archive') writeFileSync(join(f.archive, 'evidence', 'opaque.bin'), 'Archive changed during adoption')
      else if (kind === 'receipt') {
        const path = join(f.stateRoot, f.teamId, ARCHIVED_TEAM_RESTORE_RECEIPT), receipt = JSON.parse(readFileSync(path, 'utf8'))
        receipt.reason = 'Receipt rewritten during adoption'; writeFileSync(path, JSON.stringify(receipt))
      } else {
        const path = join(f.stateRoot, f.teamId, 'team.json'), team = JSON.parse(readFileSync(path, 'utf8'))
        team.captainSessionId = 'another-owner'; writeFileSync(path, JSON.stringify(team))
      }
    }
    return f.agent
  }
  await assert.rejects(f.execute(), /changed|drift|receipt|owner|captain/i)
  assert.ok(calls >= 3); assert.deepEqual(f.modelRequests, [])
})

test('Windows publication rejects an empty destination introduced at its final identity check without deleting it', { skip: process.platform !== 'win32' }, async t => {
  const f = await fixture(t), active = join(f.stateRoot, f.teamId), before = await inventory(f.archive); let changed = false
  f.ctx.agents.get = () => {
    const parent = join(f.stateRoot, '.archive-restore-staging')
    if (!changed && existsSync(parent)) for (const slot of readdirSync(parent)) {
      if (!existsSync(join(parent, slot, f.teamId, ARCHIVED_TEAM_RESTORE_RECEIPT))) continue
      changed = true; mkdirSync(active)
    }
    return f.agent
  }
  await assert.rejects(f.execute(), /destination|rename|EEXIST|EPERM|ENOTEMPTY/i)
  assert.equal(changed, true); assert.deepEqual(await readdir(active), [])
  assert.deepEqual(await inventory(f.archive), before); assert.deepEqual(f.modelRequests, [])
})

test('only an archived fully removed roster with retirement receipts can be restored without activation', async t => {
  const f = await fixture(t); f.team.members[0].status = 'idle'
  await writeFile(join(f.archive, 'team.json'), JSON.stringify(f.team))
  const before = await inventory(f.archive)
  await assert.rejects(f.execute(), /removed|retire|roster/i)
  assert.equal(await readTeam(f.stateRoot, f.teamId), undefined)
  assert.deepEqual(await inventory(f.archive), before); assert.deepEqual(f.modelRequests, [])
})

test('real native scoped capability filters expose restore to an archive-only original captain and deny retired members/forks', async t => {
  const f = await fixture(t), host = new Context(), agents = []
  const prompt = host.plugin(SystemPrompt, { includeHarnessIdentity: false }); await prompt.await()
  const tools = host.plugin(ToolRuntime, { mode: 'native' }); await tools.await()
  const require = createRequire(import.meta.url), fromTools = createRequire(require.resolve('@deepseek-ai/dsh-tools'))
  const { createScope } = await import(pathToFileURL(fromTools.resolve('@deepseek-ai/dsh-scope')).href)
  let owned
  const business = host.plugin({ inject: ['tools'], apply(ctx) {
    owned = ctx
    ctx.provide('agents', { list: () => agents, get: id => agents.find(agent => agent.id === id) })
    for (const name of TEAM_TOOL_NAMES.filter(name => name !== 'agent_teams_restore')) ctx.tools.register({ name, description: 'Fixture only: no model execution', parameters: { type: 'object', properties: {} }, output: { schema: { type: 'object', properties: {} }, render: () => [] }, execute: async () => { throw new Error('No member/model operation authorized') } })
    registerArchivedTeamRestoreTool(ctx, { stateDir: '.agent-teams' })
  } }); await business.await()
  const scopes = []
  const actor = (id, parentSession) => {
    const agent = { id, status: 'idle', session: { id, header: { id, cwd: f.workspace, parentSession, isSeeded: false, ...(parentSession ? { origin: 'subagent' } : {}) }, inheritedEventCount: 0, ownEvents: () => [], snapshotEvents: () => [], eventAt: () => undefined, seq: 0 } }
    const scope = createScope(owned, agent); agent.ctx = scope.ctx; agents.push(agent); scopes.push(scope); return agent
  }
  const captain = actor(f.agent.id), retired = actor('retired-0', f.agent.id), fork = actor('fork-caller', f.agent.id)
  const capability = host.plugin({ inject: ['tools', 'systemPrompt', 'agents'], apply(ctx) { installTeamCapabilities(ctx, { stateDir: '.agent-teams', isPendingMember: () => false, captainPrompt: () => 'Use public restore for the original archive only.' }) } }); await capability.await()
  const execute = agent => host.tools.execute({ name: 'agent_teams_restore', arguments: { team_id: f.teamId, reason: 'Human approved original assignment continuation.' }, callId: 'public-restore-test', agent, signal: new AbortController().signal })
  try {
    assert.ok(host.tools.schemas(captain).some(tool => tool.name === 'agent_teams_restore'))
    assert.equal(host.tools.get('agent_teams_restore', retired), undefined)
    assert.equal((await execute(retired)).isError, true)
    assert.equal((await execute(fork)).isError, true)
    const result = await execute(captain)
    assert.equal(result.isError, false, JSON.stringify(result))
    assert.equal(result.value.status, 'restored')
    assert.equal(result.value.work_started, false)
    assert.equal((await readTeam(f.stateRoot, f.teamId)).members.filter(m => m.status === 'removed').length, 5)
  } finally {
    await capability.dispose(); for (const scope of scopes.reverse()) await scope.dispose()
    await business.dispose(); await tools.dispose(); await prompt.dispose()
  }
})
