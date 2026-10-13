import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, relative, isAbsolute } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import { LlmAdapter } from '@deepseek-ai/dsh-llm'
const { runAgentReview } = await import(process.env.CAPTAIN_REVIEW_ARTIFACT === '1' ? '../lib/captain/agent-review.js' : '../src/captain/agent-review.ts')

const requireDsh = createRequire(import.meta.resolve('@deepseek-ai/dsh/package.json'))
const requireBase = createRequire(requireDsh.resolve('@deepseek-ai/dsh-base/package.json'))
const load = async name => import(pathToFileURL(requireBase.resolve('@deepseek-ai/dsh-' + name)).href)
const model = { provider: 'local-review-fixture', id: 'fixture', name: 'Fixture', context: { contextWindow: 262144 }, defaultMaxTokens: 8192 }
const toolResponse = (name, args, id) => [
  { type: 'block-start', index: 0, blockType: 'tool-call' },
  { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: JSON.stringify(args) },
  { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: JSON.stringify(args) } },
  { type: 'usage', usage: { inputTokens: 10, outputTokens: 1 } },
  { type: 'finish', reason: { kind: 'tool-calls' } },
]

async function fixture(t, { foreignRead = false } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'captain-agent-review-host-')), host = new Context(), fibers = [], handles = [], requests = [], publications = [], errors = [], reads = []
  t.after(async () => {
    for (const h of handles.reverse()) await h.dispose()
    for (const f of fibers.reverse()) await f.dispose()
    const rel = relative(resolve(tmpdir()), resolve(dir))
    assert.ok(!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..') && rel.startsWith('captain-agent-review-host-'))
    await rm(dir, { recursive: true, force: true })
  })
  async function mount(name, config) { const m = await load(name), f = host.plugin(m.default ?? m, config); fibers.push(f); await f.await() }
  await mount('session'); await mount('session-projection'); await mount('agent'); await mount('llm', {})
  await mount('system-prompt', { includeHarnessIdentity: false }); await mount('tools', { mode: 'ptc' })
  await mount('agent-loop', { agents: [], maxParallelToolCalls: 1 }); await mount('subagent', {}); await mount('subagent-spawn-in-process', { providerName: 'spawn' })
  host.on('agent/error', ({ error }) => errors.push(error))
  host.on('agent/created', payload => { publications.push(payload) })
  host.provide('sessionController', { inspect: async id => {
    const a = host.agents.get(id)
    return { meta: a.session.header, inheritedEventCount: a.session.inheritedEventCount, events: a.session.snapshotEvents() }
  } })
  const snapshotPath = join(dir, 'snapshot.txt'), content = 'Path: src/a.ts\n-context\n+new behavior\n'
  await writeFile(snapshotPath, content)
  const input = { baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), treeSha: 'c'.repeat(40), worktree: dir, businessContext: 'Acceptance requires the corrected behavior.', maxTokensBudget: 1000000, timeoutMs: 5000,
    paths: [{ path: 'src/a.ts', snapshotPath, fingerprint: createHash('sha256').update(content).digest('hex') }] }
  const structured = { schema_version: 'darkingdoom.agent-review/v1', status: 'complete', baseSha: input.baseSha, headSha: input.headSha, treeSha: input.treeSha,
    summary: 'All selected changes were independently inspected.', coverage: input.paths.map(p => ({ path: p.path, fingerprint: p.fingerprint, status: 'inspected', reviewScope: 'Inspected changed logic and surrounding contract.', explanation: 'Checked new behavior and regression coverage against acceptance.' })), findings: [] }
  host.tools.register({ name: 'read', description: 'Read immutable fixture snapshot', parameters: { file_path: { type: 'string' } },
    output: { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }], presentationMeta: (args, text) => ({ path: args.file_path, offset: 1, totalLines: 3, lines: text.trimEnd().split('\n').map((text, i) => ({ number: i + 1, text })) }) },
    execute: async args => { reads.push(args.file_path); return readFile(args.file_path, 'utf8') } })
  class Adapter extends LlmAdapter {
    async listModels() { return [model] }
    async resolveModel(provider, id) { return { ...model, provider, id } }
    async *stream(options) {
      requests.push(options)
      assert.ok(options.tools.some(tool => tool.name === 'read'), 'Native read policy must precede the first model activation')
      assert.ok(options.tools.some(tool => tool.name === 'structured_output'))
      assert.equal(options.tools.some(tool => tool.name === 'run_code'), false, 'PTC bridge must not escape the reviewer native policy')
      const step = requests.filter(r => r.sessionId === options.sessionId).length
      yield* step === 1 ? toolResponse('read', { file_path: foreignRead ? join(tmpdir(), 'foreign-review-secret.txt') : snapshotPath }, 'read-snapshot') : toolResponse('structured_output', structured, 'review-verdict')
    }
  }
  host.llm.registerAdapter([model.provider], new Adapter())
  const h = await host.agents.create({ sessionId: 'review-parent', meta: { cwd: dir }, agentOptions: { provider: model.provider, model: model.id } }); handles.push(h)
  return { host, parent: h.agent, input, requests, publications, errors, reads, handles }
}

test('real rc2 spawn publishes a protected fresh reviewer despite its distinct lifecycle signal', { timeout: 15000 }, async t => {
  const f = await fixture(t), result = await runAgentReview(f.host, f.parent, f.input, new AbortController().signal)
  assert.equal(f.errors.length, 0, f.errors.map(String).join('\n'))
  assert.equal(f.requests.length, 2)
  assert.equal(result.reviewerSessionId, f.publications.at(-1).agent.id)
  assert.equal(JSON.parse(result.report).tokenUsage.total, 22)
  assert.equal(f.host.agents.get(result.reviewerSessionId), undefined, 'Owned native child is quiescent and unregistered after disposal')
})

test('real concurrent reviewers and unrelated same-parent publication retain disjoint ownership', { timeout: 15000 }, async t => {
  const f = await fixture(t)
  const [a, sibling, b] = await Promise.all([
    runAgentReview(f.host, f.parent, f.input, new AbortController().signal),
    f.host.agents.create({ sessionId: 'unrelated-sibling', parentAgent: f.parent, meta: { cwd: f.input.worktree, parentSession: f.parent.id, origin: 'subagent' }, agentOptions: { provider: model.provider, model: model.id } }),
    runAgentReview(f.host, f.parent, f.input, new AbortController().signal),
  ])
  f.handles.push(sibling)
  assert.notEqual(a.reviewerSessionId, b.reviewerSessionId)
  assert.equal(f.requests.length, 4)
  assert.deepEqual(new Set(f.requests.map(r => r.sessionId)), new Set([a.reviewerSessionId, b.reviewerSessionId]))
  assert.equal(f.host.agents.get(sibling.agent.id), sibling.agent)
  assert.equal(f.host.agents.get(a.reviewerSessionId), undefined)
  assert.equal(f.host.agents.get(b.reviewerSessionId), undefined)
})

test('real native reviewer denies an out-of-scope read before its body executes and cannot pass coverage', { timeout: 15000 }, async t => {
  const f = await fixture(t, { foreignRead: true })
  await assert.rejects(runAgentReview(f.host, f.parent, f.input, new AbortController().signal), /complete successful snapshot read receipts/)
  assert.deepEqual(f.reads, [])
  assert.equal(f.host.agents.get(f.publications.at(-1).agent.id), undefined)
})

test('real native cancellation during publication rolls back before any model request', { timeout: 15000 }, async t => {
  const f = await fixture(t), cancellation = new AbortController()
  f.host.on('agent/created', ({ agent }) => {
    if (agent.session.header.parentSession === f.parent.id) cancellation.abort(new Error('owned publication revoked'))
  })
  await assert.rejects(runAgentReview(f.host, f.parent, f.input, cancellation.signal), /owned publication revoked/)
  assert.equal(f.requests.length, 0)
  assert.equal(f.host.agents.get(f.publications.at(-1).agent.id), undefined)
})
