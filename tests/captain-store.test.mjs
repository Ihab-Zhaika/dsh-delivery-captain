import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RunStore } from '../src/captain/store.ts'
test('atomic run persistence, cross-instance exclusive repository lease, and safe release', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'captain-store-'))
  const a = new RunStore(dir), b = new RunStore(dir)
  try {
    await a.acquire('repo')
    await assert.rejects(b.acquire('repo'), /owned/)
    const run = { version: 1, id: 'run1', captainSessionId: 'session', status: 'running', config: {}, tasks: [{id:'task',pendingInputWake:{fingerprint:'a'.repeat(64),at:'2026-10-14T00:00:00.000Z'}}], tickets: [], questions: [] }
    await a.save(run)
    assert.deepEqual(await b.loadAll(), [run])
    await b.release('repo')
    await assert.rejects(b.acquire('repo'), /owned/)
    await a.release('repo')
    await b.acquire('repo')
    await b.release('repo')
  } finally { await rm(dir, { recursive: true, force: true }) }
})
test('corrupt persisted state fails visibly instead of pretending no work exists', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'captain-corrupt-'))
  try {
    await writeFile(join(dir, 'run.json'), '{broken')
    await assert.rejects(new RunStore(dir).loadAll(), /corrupt/i)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
