import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { reviewTask, parseOcrReport } from '../lib/captain/review.js'

const head = 'a'.repeat(40), base = 'b'.repeat(40)
const report = () => ({ status: 'complete', comments: [], manifest: { schema_version: 'ocr.run-manifest/v1', operation: 'review', terminal_state: 'complete', input: { mode: 'range', resolved_base: base, resolved_head: head }, coverage: { selected: [{ item_id: 'a', path: 'a.txt' }], completed: [{ item_id: 'a', path: 'a.txt' }], reused: [], failed: [], waived: [] } } })

async function reviewWithBudget(t, budget) {
  const worktree = await mkdtemp(join(tmpdir(), 'captain-review-budget-'))
  t.after(() => rm(worktree, { recursive: true, force: true }))
  const calls = []
  const run = async (file, args, options) => {
    calls.push({ file, args, options })
    if (file === 'ocr') { await writeFile(args[args.indexOf('--output') + 1], JSON.stringify(report())); return '' }
    if (args[0] === 'rev-parse') return args.at(-1) === 'HEAD' ? head : base
    if (args[0] === 'diff') return 'a.txt\0'
    return ''
  }
  const task = { startedAt: new Date().toISOString(), worktree, ticket: { title: 'Fix acceptance', body: 'Keep scope' } }
  const config = { workspace: worktree, remote: 'origin', targetBranch: 'main', verifyCommands: [], maxTaskMinutes: 5, ...(budget === undefined ? {} : { ocrMaxTokensBudget: budget }) }
  return { result: await reviewTask(task, config, run), calls }
}

test('controller OCR range review explicitly defaults to a one-million-token total budget', async t => {
  const { result, calls } = await reviewWithBudget(t)
  assert.equal(result.passed, true, result.report)
  const args = calls.find(call => call.file === 'ocr').args
  assert.equal(args[args.indexOf('--max-tokens-budget') + 1], '1000000')
  assert.equal(args[args.indexOf('--from') + 1], base)
  assert.equal(args[args.indexOf('--to') + 1], head)
  assert.equal(args[args.indexOf('--format') + 1], 'json')
  assert.ok(args.includes('--output'))
})

test('controller OCR uses an explicitly configured positive budget', async t => {
  const { result, calls } = await reviewWithBudget(t, 2_000_000)
  assert.equal(result.passed, true, result.report)
  const args = calls.find(call => call.file === 'ocr').args
  assert.equal(args[args.indexOf('--max-tokens-budget') + 1], '2000000')
})

test('controller rejects invalid OCR budgets before invoking OCR', async t => {
  for (const budget of [0, -1, 1.5, NaN, Infinity, 10_000_001, Number.MAX_SAFE_INTEGER + 1, '1000000']) {
    const { result, calls } = await reviewWithBudget(t, budget)
    assert.equal(result.passed, false)
    assert.match(result.findings.join(' '), /OCR.*budget.*positive safe integer/i)
    assert.equal(calls.some(call => call.file === 'ocr'), false)
  }
})

test('a raised OCR budget still rejects partial, failed and budget-exceeded coverage', () => {
  for (const change of [
    value => { value.status = 'partial' },
    value => { value.manifest.coverage.failed = [{ item_id: 'a', path: 'a.txt', reason: 'budget' }] },
    value => { value.summary = { budget_exceeded: true } },
  ]) {
    const value = report(); change(value)
    assert.throws(() => parseOcrReport(JSON.stringify(value), head, base, ['a.txt']))
  }
})
