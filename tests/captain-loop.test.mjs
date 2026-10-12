import test from 'node:test'
import assert from 'node:assert/strict'
import { CoordinatorLoop } from '../src/captain/coordinator-loop.ts'

function host(){
  const views=new Map(),calls=[],agent={id:'main'}
  const goals={get:a=>views.get(a.id),create(a,{objective}){calls.push('create');const v={id:'goal',revision:1,objective,phase:'active',activation:'armed',roundsStarted:0,maxGoalRounds:256};views.set(a.id,v);return {...v}},resume(a,ref){assert.equal(ref.revision,views.get(a.id).revision);calls.push('resume');Object.assign(views.get(a.id),{phase:'active',activation:'armed',revision:ref.revision+1});return {...views.get(a.id)}},pause(a,ref){calls.push('pause');Object.assign(views.get(a.id),{phase:'paused',activation:'disarmed',revision:ref.revision+1});return {...views.get(a.id)}},complete(a,ref){calls.push('complete');Object.assign(views.get(a.id),{phase:'complete',activation:'disarmed',revision:ref.revision+1});return {...views.get(a.id)}},disarm(a){calls.push('disarm');views.get(a.id).activation='disarmed';return {...views.get(a.id)}}}
  const ctx={get:name=>name==='goals'?goals:undefined,agents:{get:id=>id==='main'?agent:undefined},sessionController:{resolveAgent:async()=>({agent})}}
  const run={id:'run',captainSessionId:'main',status:'running',config:{repository:'owner/repo',maxTickets:2,parallelism:2}}
  return{ctx,run,views,calls,loop:new CoordinatorLoop(ctx)}
}
test('Start creates a same-session native loop once and exposes its actual state',async()=>{
  const h=host();await h.loop.control(h.run,'start');await h.loop.control(h.run,'start')
  assert.deepEqual(h.calls,['create']);assert.equal(h.run.coordinatorGoalId,'goal');assert.equal(h.loop.state(h.run).activation,'armed')
  assert.match(h.views.get('main').objective,/DarKingDoom run run/)
})
test('unrelated unfinished goals cannot be overwritten, paused or completed',async()=>{
  const h=host();h.views.set('main',{id:'foreign',revision:1,objective:'Other work',phase:'active',activation:'armed'})
  await assert.rejects(h.loop.control(h.run,'start'),/unrelated/i)
  await h.loop.control(h.run,'pause');await h.loop.control(h.run,'stop');assert.deepEqual(h.calls,[])
})
test('waiting is quiet; only a new event rearms this owned loop; shutdown does not rearm it',async()=>{
  const h=host();await h.loop.control(h.run,'start');await h.loop.control(h.run,'wait')
  assert.equal(h.run.coordinatorWaiting,true);assert.equal(h.loop.state(h.run).activation,'disarmed')
  await h.loop.control(h.run,'wake');assert.equal(h.run.coordinatorWaiting,undefined);assert.equal(h.loop.state(h.run).activation,'armed')
  await h.loop.control(h.run,'shutdown');await h.loop.control(h.run,'wake');assert.equal(h.loop.state(h.run).activation,'disarmed')
  await h.loop.control(h.run,'resume');assert.equal(h.loop.state(h.run).activation,'armed')
})
test('Pause/Resume and Stop follow native goal lifecycle without resetting round counters',async()=>{
  const h=host();await h.loop.control(h.run,'start');h.views.get('main').roundsStarted=14
  await h.loop.control(h.run,'pause');assert.equal(h.loop.state(h.run).phase,'paused')
  await h.loop.control(h.run,'resume');assert.equal(h.loop.state(h.run).roundsStarted,14)
  await h.loop.control(h.run,'stop');assert.equal(h.loop.state(h.run).phase,'complete')
})
test('new events cannot bypass native blocked or completed goal stops',async()=>{
  const h=host();await h.loop.control(h.run,'start');await h.loop.control(h.run,'wait')
  h.views.get('main').phase='blocked';await h.loop.control(h.run,'wake');assert.equal(h.loop.state(h.run).phase,'blocked')
  h.views.get('main').phase='complete';await h.loop.control(h.run,'wake');assert.equal(h.loop.state(h.run).phase,'complete')
})

test('native human rearming makes stale waiting idempotent and does not suppress the next notification',async()=>{
  const h=host();await h.loop.control(h.run,'start');await h.loop.control(h.run,'wait')
  h.views.get('main').activation='armed'
  h.ctx.get('goals').resume=()=>{throw new Error('Native goal rejects active+armed resume')}
  assert.equal(h.loop.state(h.run).status,'active')
  await h.loop.control(h.run,'wake');assert.equal(h.run.coordinatorWaiting,undefined);assert.equal(h.loop.state(h.run).activation,'armed')
})

test('Stop revokes cold-agent loop activation before resolution completes',async()=>{
  const h=host();let release,entered;const enteredGate=new Promise(r=>entered=r),gate=new Promise(r=>release=r)
  h.ctx.agents.get=()=>undefined
  h.ctx.sessionController.resolveAgent=async()=>{entered();await gate;return{agent:{id:'main'}}}
  const pending=h.loop.control(h.run,'resume');await enteredGate
  h.run.status='stopped';h.run.coordinatorRevision=1;await h.loop.control(h.run,'stop');release()
  await assert.rejects(pending,/changed|stopped/i);assert.equal(h.views.size,0)
})
