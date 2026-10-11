import test from 'node:test'
import assert from 'node:assert/strict'
const { eligibility, phaseDurations, validateConfig } = await import('../src/captain/scheduler.ts')
const ticket = (id, milestone = 'M1', predecessors = [], extra = {}) => ({ id, milestone, predecessors, title: id, body: '', url: '', state: 'open', merged: false, priority: 2, createdAt: '2026-01-01', labels: [], ...extra })
test('strict milestones run independent predecessors first and never skip a blocked milestone', () => {
  const rows = eligibility([ticket('1', 'M1', ['2']), ticket('2'), ticket('3', 'M2')], ['M1', 'M2'], [])
  assert.deepEqual(rows.filter(r => r.eligible).map(r => r.ticketId), ['2'])
  assert.match(rows.find(r => r.ticketId === '3').reason, /milestone/i)
})
test('closed but unmerged predecessors do not unlock children', () => {
  const rows = eligibility([ticket('1', 'M1', ['2']), ticket('2', 'M1', [], { state: 'closed' })], ['M1'], [])
  assert.equal(rows.find(r => r.ticketId === '1').eligible, false)
})
test('merged predecessor unlocks task and completed milestone advances', () => {
  const rows = eligibility([ticket('1', 'M2', ['2']), ticket('2', 'M1', [], { state: 'closed', merged: true })], ['M1', 'M2'], [])
  assert.equal(rows.find(r => r.ticketId === '1').eligible, true)
})
test('cycles, missing references, and future milestone predecessors explain blockers', () => {
  const rows = eligibility([ticket('1', 'M1', ['2']), ticket('2', 'M1', ['1']), ticket('3', 'M1', ['9']), ticket('4', 'M1', ['5']), ticket('5', 'M2')], ['M1', 'M2'], [])
  assert.match(rows[0].reason, /cycle/i)
  assert.match(rows[2].reason, /missing/i)
  assert.match(rows[3].reason, /later milestone/i)
  assert.equal(rows.some(r => r.eligible), false)
})
test('claimed and failed tickets cannot be dispatched twice', () => {
  assert.equal(eligibility([ticket('1')], ['M1'], [{ ticket: ticket('1'), status: 'failed' }])[0].eligible, false)
})
test('phase durations partition wall time and count repeated repairs', () => {
  const task = { startedAt: '2026-01-01T00:00:00Z', finishedAt: '2026-01-01T00:00:40Z', phases: [{ phase: 'implementation', at: '2026-01-01T00:00:00Z' }, { phase: 'review', at: '2026-01-01T00:00:10Z' }, { phase: 'repair', at: '2026-01-01T00:00:20Z' }, { phase: 'review', at: '2026-01-01T00:00:30Z' }] }
  assert.deepEqual(phaseDurations(task), { implementation: 10000, review: 20000, repair: 10000 })
})
test('untrusted configuration rejects duplicate milestones and unbounded execution', () => {
  assert.throws(() => validateConfig({ milestones: ['M1', 'M1'] }), /milestone/)
})
