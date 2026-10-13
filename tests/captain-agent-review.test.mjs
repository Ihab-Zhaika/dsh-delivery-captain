import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { assertObjectJsonSchema } from '@deepseek-ai/dsh-tools'
import { runAgentReview } from '../src/captain/agent-review.ts'

const sha = n => n.repeat(40)
async function fixture(t, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'captain-agent-review-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const paths = await Promise.all((options.pathNames ?? ['src/a.ts', 'tests/a.test.mjs', 'docs/a.md']).map(async (path, i) => {
    const snapshotPath = join(dir, `snapshot-${i}.txt`), content = `Path: ${path}\n-context\n+new behavior\n`
    await writeFile(snapshotPath, content)
    return { path, snapshotPath, fingerprint: createHash('sha256').update(content).digest('hex') }
  }))
  const input = { baseSha: sha('a'), headSha: sha('b'), treeSha: sha('c'), worktree: dir, businessContext: 'Acceptance requires the corrected behavior.', maxTokensBudget: 1000000, timeoutMs: 5000, paths }
  const structured = { schema_version: 'darkingdoom.agent-review/v1', status: 'complete', baseSha: input.baseSha, headSha: input.headSha, treeSha: input.treeSha, summary: 'All selected changes were independently inspected.', coverage: paths.map(p => ({ path: p.path, fingerprint: p.fingerprint, status: 'inspected', reviewScope: 'Inspected changed logic, contracts and surrounding context.', explanation: 'Checked the new behavior and its regression coverage against acceptance.' })), findings: [] }
  const listeners = new Map(), guards = [], modes = [], disposed = [], calls = []
  const on = (name, fn) => { const entries = listeners.get(name) ?? new Set(); entries.add(fn); listeners.set(name, entries); return () => entries.delete(fn) }
  const emit = async (name, ...args) => { for (const fn of listeners.get(name) ?? []) await fn(...args) }
  const parent = { session: { id: 'main', header: { id: 'main' } } }
  const child = { session: { id: 'review-child', header: { id: 'review-child', origin: 'subagent', parentSession: 'main', isSeeded: false } }, ctx: { tools: { guard(fn) { guards.push(fn); return () => disposed.push('guard') }, presentAs(mode) { modes.push(mode); return () => disposed.push('mode') } } } }
  const events = []
  for (const [i, path] of paths.entries()) {
    const seq = events.length, text = await readFile(path.snapshotPath, 'utf8')
    events.push({ seq, type: 'tool/call', data: { callId: `read-${i}`, name: 'read', arguments: JSON.stringify({ file_path: path.snapshotPath }) } })
    events.push({ seq: seq + 1, type: 'tool/result', sourceEventSeqs: [seq], data: { message: { toolCallId: `read-${i}`, isError: false }, meta: { path: path.snapshotPath, offset: 1, totalLines: 3, lines: text.trimEnd().split('\n').map((text, i) => ({ number: i + 1, text })) } } })
  }
  events.push({ seq: events.length, type: 'assistant/message', data: { turn: 0, step: 0, stream: [], usage: { inputTokens: 25, outputTokens: 10, cacheReadTokens: 20, cacheWriteTokens: 5 } } })
  const inspection = { meta: structuredClone(child.session.header), inheritedEventCount: 0, events }
  const provider = { name: 'spawn', inheritsParentContext: false, capabilities: { outputSchema: true, persona: true, toolFilter: true, agentOptions: true } }
  const ctx = { on, tools: { get: name => name === 'read' ? { name, parameters: { file_path: { type: 'string' }, offset: { type: 'integer' }, limit: { type: 'integer' } } } : undefined }, sessionController: { inspect: async () => inspection }, subagents: { getProvider: () => provider, start: async (name, request) => {
    calls.push({ name, request })
    if (options.startError) throw new Error('native capacity unavailable')
    child.options = { ...request.agentOptions }
    await emit('agent/created', { agent: child, source: 'create', signal: new AbortController().signal })
    const result = options.result ? options.result(request, { emit, child, events, structured, guards }) : Promise.resolve({ stopReason: options.stopReason ?? 'completed', structured, output: [] })
    return { id: 'review-child', localAgent: child, result, async dispose() { if (options.disposeWait) await options.disposeWait; disposed.push('run'); if (options.disposeError) throw new Error('native quiescence failed') } }
  } } }
  return { ctx, parent, input, structured, events, inspection, provider, guards, modes, disposed, calls, listeners, emit, child }
}

test('fresh native review validates every selected snapshot read and canonical structured capture', async t => {
  const f = await fixture(t), result = await runAgentReview(f.ctx, f.parent, f.input, new AbortController().signal)
  assert.equal(result.reviewerSessionId, 'review-child')
  assert.deepEqual(result.findings, [])
  const report = JSON.parse(result.report)
  assert.equal(report.provider, 'spawn'); assert.equal(report.parentSessionId, 'main')
  assert.equal(report.tokenUsage.total, 60); assert.equal(report.tokenUsage.budget, 1000000)
  assert.equal(report.result.coverage.length, 3)
  assert.deepEqual(f.calls[0].request.toolFilter, { allow: ['read'] })
  assertObjectJsonSchema(f.calls[0].request.outputSchema)
  assert.match(f.calls[0].request.persona, /independent/i)
  assert.deepEqual(f.modes, ['native'])
  assert.equal(f.disposed[0], 'run'); assert.ok(f.disposed.includes('guard'))
  assert.ok([...f.listeners.values()].every(entries => entries.size === 0))
})

test('fresh review provides complete native page plans and reads generated bulk after source contracts',async t=>{
  const f=await fixture(t,{pathNames:['lib/client.js.map','src/captain/runtime.ts','tests/a.test.mjs','docs/a.md']})
  await runAgentReview(f.ctx,f.parent,f.input,new AbortController().signal)
  const text=f.calls[0].request.prompt[0].text
  assert.match(text,/batch.*native read/i)
  const marker='Native read plan (data):\n';assert.ok(text.includes(marker))
  const plan=JSON.parse(text.slice(text.indexOf(marker)+marker.length))
  assert.equal(plan.length,f.input.paths.length)
  assert.equal(plan[0].path,'src/captain/runtime.ts');assert.equal(plan.at(-1).path,'lib/client.js.map')
  assert.deepEqual(new Set(plan.map(p=>p.snapshotPath)),new Set(f.input.paths.map(p=>p.snapshotPath)))
  for(const page of plan){assert.equal(page.offset,1);assert.equal(page.limit,3);assert.ok(page.bytes<=45*1024)}
})

test('native page plan covers large Unicode snapshots and empty files within byte and line bounds',async t=>{
  const f=await fixture(t,{pathNames:['src/unicode.ts','docs/empty.md'],startError:true})
  const contents=[Array.from({length:90},()=>'界'.repeat(1000)).join('\r\n')+'\r\n','']
  for(const [index,path]of f.input.paths.entries()){await writeFile(path.snapshotPath,contents[index]);path.fingerprint=createHash('sha256').update(contents[index]).digest('hex')}
  await assert.rejects(runAgentReview(f.ctx,f.parent,f.input,new AbortController().signal),/capacity/)
  const text=f.calls[0].request.prompt[0].text,marker='Native read plan (data):\n',plan=JSON.parse(text.slice(text.indexOf(marker)+marker.length))
  const pages=plan.filter(p=>p.path==='src/unicode.ts');assert.ok(pages.length>1)
  let next=1;for(const page of pages){assert.equal(page.offset,next);assert.ok(page.limit>0&&page.limit<=2000);assert.ok(page.bytes<=45*1024);next+=page.limit}
  assert.equal(next,91);assert.deepEqual(plan.filter(p=>p.path==='docs/empty.md').map(p=>[p.offset,p.limit,p.bytes]),[[1,1,0]])
  assert.equal(f.disposed.includes('run'),false,'Planning never invents a native review after capacity rejection')
})

test('child guard allows only selected immutable snapshots and blocks workspace secrets', async t => {
  const f = await fixture(t, { result: async (request, { guards }) => {
    assert.equal(guards.length, 1)
    for (const name of ['write', 'edit', 'shell', 'run_code', 'agent_teams_create', 'send_message']) assert.match(guards[0]({ name, arguments: {}, agent: f.child }), /read-only/i)
    assert.equal(guards[0]({ name: 'read', arguments: { file_path: f.input.paths[0].snapshotPath }, agent: f.child }), undefined)
    assert.match(guards[0]({ name: 'read', arguments: { file_path: join(f.input.worktree, 'src/a.ts') }, agent: f.child }), /selected.*snapshots/i)
    assert.match(guards[0]({ name: 'read', arguments: { file_path: join(f.input.worktree, '.env') }, agent: f.child }), /selected.*snapshots/i)
    assert.match(guards[0]({ name: 'read', arguments: { file_path: join(f.input.worktree, 'workspace-link', 'external-secret') }, agent: f.child }), /selected.*snapshots/i)
    assert.equal(guards[0]({ name: 'structured_output', arguments: {}, agent: f.child }), undefined)
    assert.match(guards[0]({ name: 'read', arguments: { file_path: join(tmpdir(), 'foreign-secret') }, agent: f.child }), /outside/i)
    return { stopReason: 'completed', structured: f.structured, output: [] }
  } })
  await runAgentReview(f.ctx, f.parent, f.input, new AbortController().signal)
})

for (const [name, mutate] of [
  ['wrong head', f => { f.structured.headSha = sha('e') }],
  ['wrong tree', f => { f.structured.treeSha = sha('e') }],
  ['missing path', f => { f.structured.coverage.pop() }],
  ['duplicate path', f => { f.structured.coverage[1] = f.structured.coverage[0] }],
  ['foreign path', f => { f.structured.coverage[0].path = 'foreign.ts' }],
  ['wrong fingerprint', f => { f.structured.coverage[0].fingerprint = '0'.repeat(64) }],
  ['waived inspection', f => { f.structured.coverage[0].status = 'waived' }],
  ['empty explanation', f => { f.structured.coverage[0].explanation = '' }],
  ['missing actual reads', f => { f.events.splice(0, 6) }],
  ['failed actual read', f => { f.events[1].data.message.isError = true }],
  ['foreign result receipt', f => { f.events[1].sourceEventSeqs = [99] }],
  ['truncated line', f => { f.events[1].data.meta.lines[1].text = 'truncated' }],
  ['partial actual read', f => { f.events[1].data.meta.lines.pop() }],
  ['wrong read total', f => { f.events[1].data.meta.totalLines = 4 }],
  ['accounting unavailable', f => { delete f.events.at(-1).data.usage }],
  ['budget exceeded across cached tokens', f => { f.input.maxTokensBudget = 59 }],
  ['seeded history', f => { f.inspection.inheritedEventCount = 2 }],
  ['wrong parent', f => { f.inspection.meta.parentSession = 'worker' }],
]) test(`rejects ${name} and still reaches disposal`, async t => {
  const f = await fixture(t); mutate(f)
  await assert.rejects(runAgentReview(f.ctx, f.parent, f.input, new AbortController().signal))
  assert.ok(f.disposed.includes('run'))
})

test('wrong snapshot fingerprint is rejected before invoking the provider', async t => {
  const f = await fixture(t); await writeFile(f.input.paths[0].snapshotPath, 'changed')
  await assert.rejects(runAgentReview(f.ctx, f.parent, f.input, new AbortController().signal), /snapshot|fingerprint/i)
  assert.equal(f.calls.length, 0)
})

test('review output is detached from borrowed native structured values', async t => {
  const f = await fixture(t), result = await runAgentReview(f.ctx, f.parent, f.input, new AbortController().signal)
  f.structured.summary = 'mutated'; f.structured.coverage.length = 0
  assert.equal(JSON.parse(result.report).result.coverage.length, 3)
})

test('native provider unavailability never falls back or invokes remote/manual review', async t => {
  const f = await fixture(t); f.provider.inheritsParentContext = true
  await assert.rejects(runAgentReview(f.ctx, f.parent, f.input, new AbortController().signal), /available|fresh|spawn/i)
  assert.equal(f.calls.length, 0)
  f.provider.inheritsParentContext = false; f.provider.capabilities.toolFilter = false
  await assert.rejects(runAgentReview(f.ctx, f.parent, f.input, new AbortController().signal))
  assert.equal(f.calls.length, 0)
})

test('pre-publication capacity error does not invent a run to dispose', async t => {
  const f = await fixture(t, { startError: true })
  await assert.rejects(runAgentReview(f.ctx, f.parent, f.input, new AbortController().signal), /capacity/i)
  assert.equal(f.disposed.includes('run'), false)
  assert.ok([...f.listeners.values()].every(entries => entries.size === 0))
})

test('post-publication cancellation propagates to canonical signal and awaits actual quiescence', async t => {
  const cancellation = new AbortController(); let release
  const disposed = new Promise(resolve => { release = resolve })
  const f = await fixture(t, { disposeWait: disposed, result: async request => { queueMicrotask(() => cancellation.abort(new Error('review revoked'))); return new Promise(() => {}) } })
  let settled = false
  const promise = runAgentReview(f.ctx, f.parent, f.input, cancellation.signal).finally(() => { settled = true })
  await new Promise(resolve => setTimeout(resolve, 25))
  assert.equal(f.calls[0].request.signal.aborted, true); assert.equal(settled, false)
  release(); await assert.rejects(promise, /revoked|abort/i)
  assert.ok(f.disposed.includes('run'))
})

test('bounded timeout cancels a stuck native result and disposes it', async t => {
  const f = await fixture(t, { result: () => new Promise(() => {}) }); f.input.timeoutMs = 15
  await assert.rejects(runAgentReview(f.ctx, f.parent, f.input, new AbortController().signal), /timeout/i)
  assert.equal(f.calls[0].request.signal.aborted, true); assert.ok(f.disposed.includes('run'))
})

test('live session usage enforces independent aggregate ceiling through canonical abort', async t => {
  const f = await fixture(t, { result: async (request, { emit, child }) => {
    await emit('session/event', child.session, { seq: 10, type: 'assistant/message', data: { usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 1000000 } } })
    return new Promise(() => {})
  } })
  await assert.rejects(runAgentReview(f.ctx, f.parent, f.input, new AbortController().signal), /budget/i)
  assert.equal(f.calls[0].request.signal.aborted, true)
})

test('non-completed native stop rejects even complete-looking structured data', async t => {
  const f = await fixture(t, { stopReason: 'max-tokens' })
  await assert.rejects(runAgentReview(f.ctx, f.parent, f.input, new AbortController().signal), /completed|incomplete|stop/i)
})

test('successful read pagination proves all immutable lines without assuming requested limit was delivered', async t => {
  const f = await fixture(t), first = f.events[1]
  first.data.meta.lines = first.data.meta.lines.slice(0, 1)
  f.events.splice(2, 0,
    { seq: 1.1, type: 'tool/call', data: { callId: 'read-rest', name: 'read', arguments: JSON.stringify({ file_path: f.input.paths[0].snapshotPath, offset: 2, limit: 2 }) } },
    { seq: 1.2, type: 'tool/result', sourceEventSeqs: [1.1], data: { message: { toolCallId: 'read-rest', isError: false }, meta: { path: f.input.paths[0].snapshotPath, offset: 2, totalLines: 3, lines: [{ number: 2, text: '-context' }, { number: 3, text: '+new behavior' }] } } })
  const result = await runAgentReview(f.ctx, f.parent, f.input, new AbortController().signal)
  assert.equal(JSON.parse(result.report).result.status, 'complete')
})

test('snapshot change during review cannot produce reusable completion evidence', async t => {
  const f = await fixture(t, { result: async () => {
    await writeFile(f.input.paths[0].snapshotPath, 'external mutation')
    return { stopReason: 'completed', structured: f.structured, output: [] }
  } })
  await assert.rejects(runAgentReview(f.ctx, f.parent, f.input, new AbortController().signal), /fingerprint/i)
  assert.ok(f.disposed.includes('run'))
})

test('creation observer cannot install policies on sibling or parent sessions', async t => {
  const f = await fixture(t, { result: async (_request, { emit }) => {
    await emit('agent/created', { agent: f.parent, signal: new AbortController().signal })
    await emit('agent/created', { agent: { session: { id: 'sibling' } }, signal: new AbortController().signal })
    assert.equal(f.guards.length, 1)
    await emit('session/event', { id: 'sibling' }, { type: 'assistant/message', seq: 1, data: { usage: { inputTokens: 99999999999, outputTokens: 1 } } })
    return { stopReason: 'completed', structured: f.structured, output: [] }
  } })
  await runAgentReview(f.ctx, f.parent, f.input, new AbortController().signal)
})

test('native infrastructure rejection remains a gate failure and disposes published run', async t => {
  const f = await fixture(t, { result: async () => { throw new Error('native collection infrastructure failure') } })
  await assert.rejects(runAgentReview(f.ctx, f.parent, f.input, new AbortController().signal), /infrastructure/i)
  assert.ok(f.disposed.includes('run'))
})

test('native projected usage includes failed/retried attempt stream usage', async t => {
  const f = await fixture(t)
  const usage = { inputTokens: 70, outputTokens: 10, cacheReadTokens: 20, cacheWriteTokens: 5 }
  f.events.splice(6, 0,
    { seq: 6, type: 'assistant/attempt', data: { turn: 0, step: 0, stream: [{ type: 'chunk', time: 1, chunk: { type: 'usage', usage } }] } },
    { seq: 7, type: 'llm/retry-started', data: { turn: 0, step: 0 } })
  f.events.at(-1).seq = 8
  const result = await runAgentReview(f.ctx, f.parent, f.input, new AbortController().signal)
  assert.equal(JSON.parse(result.report).tokenUsage.total, 165)
})

test('native projected usage replaces duplicate settlement samples for one attempt', async t => {
  const f = await fixture(t)
  f.events.push({ ...structuredClone(f.events.at(-1)), seq: 7 })
  const result = await runAgentReview(f.ctx, f.parent, f.input, new AbortController().signal)
  assert.equal(JSON.parse(result.report).tokenUsage.total, 60)
})

test('failed native quiescence never lifts child read-only protection or returns accepted evidence', async t => {
  const f = await fixture(t, { disposeError: true })
  await assert.rejects(runAgentReview(f.ctx, f.parent, f.input, new AbortController().signal), /quiescence/i)
  assert.equal(f.disposed.includes('guard'), false)
  assert.equal(f.calls[0].request.signal.aborted, true)
  assert.ok([...f.listeners.values()].every(entries => entries.size === 0))
})
