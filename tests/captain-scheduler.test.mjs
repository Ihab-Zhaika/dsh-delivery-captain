import test from 'node:test'
import assert from 'node:assert/strict'
const { eligibility, phaseDurations, validateConfig, taskDeadline } = await import('../src/captain/scheduler.ts')
const ticket = (id, milestone = 'M1', predecessors = [], extra = {}) => ({ id, milestone, predecessors, title: id, body: '', url: '', state: 'open', merged: false, priority: 2, createdAt: '2026-01-01', labels: [], ...extra })
test('independent tickets across milestones are eligible while predecessors remain blocked', () => {
  const rows = eligibility([ticket('1', 'M1', ['2']), ticket('2'), ticket('3', 'M2')], ['M1', 'M2'], [])
  assert.deepEqual(rows.filter(r => r.eligible).map(r => r.ticketId), ['2','3'])
  assert.match(rows.find(r => r.ticketId === '1').reason, /predecessor 2/i)
})
test('closed but unmerged predecessors do not unlock children', () => {
  const rows = eligibility([ticket('1', 'M1', ['2']), ticket('2', 'M1', [], { state: 'closed' })], ['M1'], [])
  assert.equal(rows.find(r => r.ticketId === '1').eligible, false)
})
test('completed non-code decisions satisfy prerequisites without claiming a code merge',()=>{
  const decision=ticket('2','M1',[],{state:'closed',merged:false,completedDecision:true})
  assert.equal(eligibility([ticket('1','M1',['2']),decision],['M1'],[])[0].eligible,true)
  assert.equal(decision.merged,false)
  assert.match(eligibility([decision],['M1'],[])[0].reason,/Decision completed/)
})
test('merged predecessor unlocks task and completed milestone advances', () => {
  const rows = eligibility([ticket('1', 'M2', ['2']), ticket('2', 'M1', [], { state: 'closed', merged: true })], ['M1', 'M2'], [])
  assert.equal(rows.find(r => r.ticketId === '1').eligible, true)
})
test('cycles and missing references block while later-milestone prerequisites can run', () => {
  const rows = eligibility([ticket('1', 'M1', ['2']), ticket('2', 'M1', ['1']), ticket('3', 'M1', ['9']), ticket('4', 'M1', ['5']), ticket('5', 'M2')], ['M1', 'M2'], [])
  assert.match(rows[0].reason, /cycle/i)
  assert.match(rows[2].reason, /missing/i)
  assert.match(rows[3].reason, /predecessor 5/i)
  assert.deepEqual(rows.filter(r=>r.eligible).map(r=>r.ticketId),['5'])
})
test('claimed and failed tickets cannot be dispatched twice', () => {
  assert.equal(eligibility([ticket('1')], ['M1'], [{ ticket: ticket('1'), status: 'failed' }])[0].eligible, false)
})

test('parked predecessors block only their dependents, not independent later milestones',()=>{
  const rows=eligibility([ticket('1'),ticket('2','M1',['1']),ticket('3','M2'),ticket('4','M1',[],{state:'closed',merged:true}),ticket('5','M1',[],{exclusion:'Outside selection'})],['M1','M2'],[{ticket:ticket('1'),status:'parked',error:'Device missing'}])
  assert.equal(rows[0].state,'parked');assert.match(rows[0].reason,/Device missing/)
  assert.equal(rows[1].state,'dependency');assert.deepEqual(rows[1].predecessors,['1'])
  assert.equal(rows[2].state,'eligible');assert.equal(rows[3].state,'delivered');assert.equal(rows[4].state,'excluded')
})
test('phase durations partition wall time and count repeated repairs', () => {
  const task = { startedAt: '2026-01-01T00:00:00Z', finishedAt: '2026-01-01T00:00:40Z', phases: [{ phase: 'implementation', at: '2026-01-01T00:00:00Z' }, { phase: 'review', at: '2026-01-01T00:00:10Z' }, { phase: 'repair', at: '2026-01-01T00:00:20Z' }, { phase: 'review', at: '2026-01-01T00:00:30Z' }] }
  assert.deepEqual(phaseDurations(task), { implementation: 10000, review: 20000, repair: 10000 })
})

test('human retry budget uses its own bounded epoch without resetting historical elapsed phases',()=>{
  const task={startedAt:'2026-01-01T00:00:00Z',budgetStartedAt:'2026-01-02T00:00:00Z',phases:[{phase:'analysis',at:'2026-01-01T00:00:00Z'},{phase:'parked',at:'2026-01-01T01:00:00Z'},{phase:'waiting',at:'2026-01-02T00:00:00Z'},{phase:'parked',at:'2026-01-02T00:20:00Z'},{phase:'analysis',at:'2026-01-02T00:30:00Z'}]}
  assert.equal(taskDeadline(task,60,Date.parse('2026-01-02T00:45:00Z')),Date.parse('2026-01-02T01:10:00Z'))
  assert.equal(phaseDurations(task,Date.parse('2026-01-02T00:45:00Z')).parked,23*3600000+600000)
})
test('untrusted configuration rejects duplicate milestones and unbounded execution', () => {
  assert.throws(() => validateConfig({ milestones: ['M1', 'M1'] }), /milestone/)
})
