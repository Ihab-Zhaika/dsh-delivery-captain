import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CaptainController } from '../src/captain/controller.ts'
import { RunStore } from '../src/captain/store.ts'
const config = (workspace) => ({provider:'github',repository:'owner/repo',workspace,milestones:['M1','M2'],remote:'origin',targetBranch:'main',parallelism:2,maxTeamMembers:2,pollSeconds:5,maxRepairRounds:2,maxTaskMinutes:30,verifyCommands:['npm test'],workerPreset:'standard',requireMemory:false,requireBrowser:false})
const ticket = (id, milestone='M1',predecessors=[]) => ({id,title:id,body:'Implement acceptance',url:'https://example.com/'+id,milestone,predecessors,state:'open',merged:false,priority:2,createdAt:'2026-01-01',labels:[]})
async function fixture(fn) {
  const dir = await mkdtemp(join(tmpdir(),'captain-control-'))
  let tickets=[ticket('1'),ticket('2'),ticket('3','M2')], passing=true, remoteChecks=true
  const starts=[],messages=[],merges=[],running=new Set()
  const runtime={preflight:async()=>{},prepare:async(t)=>{t.baseSha='base'},start:async(t)=>{starts.push(t.id);running.add(t.sessionId)},send:async(id,text)=>messages.push({id,text}),stop:async(id)=>{running.delete(id)},isRunning:async(id)=>running.has(id),review:async()=>({passed:passing,headSha:'head',report:'report.json',findings:passing?[]:['Fix bug']}),head:async()=> 'head'}
  const pr=()=>({id:'1',url:'https://example.com/pr',headSha:'head',merged:false,checksPassed:remoteChecks})
  const provider={preflight:async()=>{},discover:async()=>structuredClone(tickets),claim:async()=>{},ensurePullRequest:async()=>pr(),inspectPullRequest:async()=>pr(),merge:async(t)=>{merges.push(t.id);return {...pr(),merged:true,mergeSha:'merged'}},close:async(t)=>{const item=tickets.find(x=>x.id===t.ticket.id);if(item){item.state='closed';item.merged=true}},createFollowup:async()=> '9'}
  const controller=new CaptainController(new RunStore(join(dir,'state')),runtime,()=>provider)
  try {await fn({controller,runtime,provider,dir,starts,messages,merges,config:config(dir),setTickets:v=>tickets=v,setPassing:v=>passing=v,setChecks:v=>remoteChecks=v})} finally {await controller.dispose();await rm(dir,{recursive:true,force:true})}
}
test('explicit start schedules bounded independent tickets; overlapping ticks cannot duplicate',()=>fixture(async f=>{
  assert.equal(f.controller.state('captain'),null)
  await f.controller.start('captain',f.config)
  await Promise.all([f.controller.tick(),f.controller.tick()])
  assert.equal(f.starts.length,2)
  assert.equal(f.controller.state('captain').tasks.length,2)
}))

test('a one-ticket trial never claims a second ticket and stops after verified closure',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:1})
  await Promise.all([f.controller.tick(),f.controller.tick()])
  assert.equal(run.config.maxTickets,1)
  assert.equal(run.tasks.length,1)
  const task=run.tasks[0]
  await f.controller.report(task.sessionId,{phase:'review',ready:true})
  await f.controller.tick();await f.controller.tick()
  assert.equal(task.status,'merged');assert.ok(task.closedAt)
  assert.equal(run.status,'stopped');assert.equal(f.starts.length,1)
  await f.controller.control('captain','resume');await f.controller.tick()
  assert.equal(run.status,'stopped');assert.equal(run.tasks.length,1)
}))

test('failed claims count toward a trial cap and cannot admit substitute tickets',()=>fixture(async f=>{
  f.provider.claim=async()=>{throw new Error('Foreign claim')}
  const run=await f.controller.start('captain',{...f.config,maxTickets:1,maxRepairRounds:0})
  await f.controller.tick();await f.controller.tick()
  assert.equal(run.tasks.length,1);assert.equal(f.starts.length,0)
  assert.equal(run.tasks[0].status,'blocked')
}))
test('explicit ticket selection never substitutes another ready ticket and applies scoped verification',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:2,ticketIds:['2'],verifyCommandsByTicket:{'2':['documentation gate']}})
  f.runtime.review=async(_task,cfg)=>{assert.deepEqual(cfg.verifyCommands,['documentation gate']);return{passed:true,headSha:'head',report:'pass',findings:[]}}
  await f.controller.tick()
  assert.deepEqual(run.tasks.map(t=>t.ticket.id),['2'])
  await f.controller.report(run.tasks[0].sessionId,{phase:'testing',ready:true});await f.controller.tick()
  assert.equal(run.tasks[0].status,'merged');assert.equal(run.tasks.length,1)
}))
test('ordinary sessions cannot report, answer, or create followups',()=>fixture(async f=>{
  await assert.rejects(f.controller.report('ordinary',{phase:'complete',ready:true}),/worker/i)
  await assert.rejects(f.controller.answer('ordinary','question','answer'),/captain/i)
}))
test('failed review repairs instead of merging, then passing exact head merges and closes',()=>fixture(async f=>{
  await f.controller.start('captain',{...f.config,parallelism:1});await f.controller.tick()
  const task=f.controller.state('captain').tasks[0]
  f.setPassing(false);await f.controller.report(task.sessionId,{phase:'review',ready:true});await f.controller.tick()
  assert.equal(f.merges.length,0);assert.equal(task.phase,'repair');assert.equal(task.reviewRounds,1)
  assert.ok(f.messages.some(m=>m.text.includes('Fix bug')))
  f.setPassing(true);await f.controller.report(task.sessionId,{phase:'review',ready:true});await f.controller.tick()
  assert.equal(f.merges.length,1);assert.equal(task.status,'merged')
}))
test('pause and stop prevent new claims while preserving tasks',()=>fixture(async f=>{
  await f.controller.start('captain',f.config)
  await f.controller.control('captain','pause');await f.controller.tick();assert.equal(f.starts.length,0)
  await f.controller.control('captain','resume');await f.controller.tick();assert.equal(f.starts.length,2)
  await f.controller.control('captain','stop');await f.controller.tick();assert.equal(f.starts.length,2)
  assert.equal(f.controller.state('captain').status,'stopped')
}))

test('stopped workers resume automatically in the same sessions with admission caps retained',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:2});await f.controller.tick()
  const ids=run.tasks.map(t=>t.id),sessions=run.tasks.map(t=>t.sessionId)
  await f.controller.control('captain','stop');await f.controller.dispose()
  const next=new CaptainController(new RunStore(join(f.dir,'state')),f.runtime,()=>f.provider)
  try {
    await next.restore();await next.control('captain','resume');await next.tick()
    const resumed=next.state('captain')
    assert.deepEqual(resumed.tasks.map(t=>t.id),ids);assert.deepEqual(resumed.tasks.map(t=>t.sessionId),sessions)
    assert.deepEqual(resumed.tasks.map(t=>t.status),['running','running'])
    assert.equal(f.starts.length,4);assert.equal(resumed.config.maxTickets,2)
  } finally {await next.dispose()}
}))

test('resumed parked tasks wait for capacity and merged tasks never restart',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:2});await f.controller.tick()
  await f.controller.control('captain','stop');await f.controller.control('captain','parallelism',1)
  await f.controller.control('captain','resume');await f.controller.tick()
  assert.deepEqual(run.tasks.map(t=>t.status),['running','blocked']);assert.equal(f.starts.length,3)
  await f.controller.report(run.tasks[0].sessionId,{phase:'review',ready:true});await f.controller.tick()
  assert.deepEqual(run.tasks.map(t=>t.status),['merged','running']);assert.equal(f.starts.length,4)
  await f.controller.control('captain','stop');await f.controller.control('captain','resume');await f.controller.tick()
  assert.equal(run.tasks[0].status,'merged');assert.equal(f.starts.filter(id=>id===run.tasks[0].id).length,2)
}))

test('captain answers cannot append boilerplate that contradicts a specific hold',()=>fixture(async f=>{
  await f.controller.start('captain',f.config);await f.controller.tick()
  const task=f.controller.state('captain').tasks[0],q=await f.controller.question(task.sessionId,'Prerequisite missing')
  const answer='Hold implementation until the prerequisite is verified; preserve existing work.'
  await f.controller.answer('captain',q.id,answer)
  assert.equal(f.messages.at(-1).text,`Captain answer to ${q.id}: ${answer}`)
}))

test('explicit guidance consumes a pending resume so a subsequent blocker is not silently relaunched',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick()
  const task=run.tasks[0]
  await f.controller.control('captain','stop');await f.controller.control('captain','resume')
  await f.controller.message('captain',task.id,'Investigate only; preserve the prerequisite hold')
  await f.controller.report(task.sessionId,{phase:'blocked',blocked:true,note:'Prerequisite still unavailable'})
  await f.controller.tick()
  assert.equal(task.status,'blocked');assert.equal(f.starts.length,1);assert.equal(task.resumeRequested,undefined)
}))

test('pause and drain park pending resumes until explicitly resumed again',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick()
  run.tasks[0].startedAt=new Date(Date.now()-61000).toISOString()
  await f.controller.control('captain','stop');await f.controller.control('captain','resume')
  await f.controller.control('captain','pause');await f.controller.tick()
  assert.equal(f.starts.length,1);assert.equal(run.tasks[0].resumeRequested,true)
  await f.controller.control('captain','drain');await f.controller.tick()
  assert.equal(f.starts.length,1);assert.equal(run.tasks[0].resumeRequested,true)
  await f.controller.control('captain','resume');await f.controller.tick()
  assert.equal(f.starts.length,2);assert.equal(run.tasks[0].status,'running')
}))
test('questions are durable and answers wake the owning worker',()=>fixture(async f=>{
  await f.controller.start('captain',f.config);await f.controller.tick()
  const task=f.controller.state('captain').tasks[0]
  const q=await f.controller.question(task.sessionId,'Which implementation meets scope?')
  assert.equal(q.answer,undefined);assert.ok(f.messages.some(m=>m.id==='captain'))
  await f.controller.answer('captain',q.id,'Use project convention')
  assert.equal(q.answer,'Use project convention');assert.ok(q.deliveredAt)
  assert.ok(f.messages.some(m=>m.id===task.sessionId&&m.text.includes('Use project convention')))
}))
test('empty continuous queue stays running and picks up newly eligible tickets',()=>fixture(async f=>{
  f.setTickets([]);await f.controller.start('captain',f.config);await f.controller.tick();assert.equal(f.starts.length,0)
  f.setTickets([ticket('10')]);await f.controller.tick();assert.equal(f.starts.length,1)
}))
test('stop drains a worker whose launch was already awaiting completion',()=>fixture(async f=>{
  let entered, release
  const started=new Promise(r=>entered=r), gate=new Promise(r=>release=r)
  let live=false
  f.runtime.start=async()=>{entered();await gate;live=true}
  f.runtime.stop=async()=>{live=false}
  await f.controller.start('captain',{...f.config,parallelism:1})
  const tick=f.controller.tick();await started
  const stop=f.controller.control('captain','stop');release();await Promise.all([tick,stop])
  assert.equal(live,false);assert.equal(f.controller.state('captain').tasks[0].status,'cancelled')
}))
test('failed external claims are not bypassed on blocked recovery',()=>fixture(async f=>{
  f.provider.claim=async()=>{throw new Error('Already owned by another run')}
  await f.controller.start('captain',{...f.config,parallelism:1});await f.controller.tick()
  for(const task of f.controller.state('captain').tasks)task.lastWakeAt='2000-01-01'
  await f.controller.tick();assert.equal(f.starts.length,0)
}))
test('one captain session cannot start two repositories concurrently',()=>fixture(async f=>{
  const results=await Promise.allSettled([f.controller.start('captain',f.config),f.controller.start('captain',{...f.config,repository:'owner/second'})])
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
}))
test('already merged PR cannot declare a different head complete',()=>fixture(async f=>{
  f.provider.ensurePullRequest=async()=>({id:'1',url:'url',merged:true,headSha:'different',mergeSha:'bad',checksPassed:true})
  await f.controller.start('captain',{...f.config,parallelism:1});await f.controller.tick()
  const task=f.controller.state('captain').tasks[0]
  await f.controller.report(task.sessionId,{phase:'review',ready:true});await f.controller.tick()
  assert.notEqual(task.status,'merged')
}))
test('concurrent captain guidance reserves capacity before awakening parked workers',()=>fixture(async f=>{
  await f.controller.start('captain',f.config);await f.controller.tick()
  const run=f.controller.state('captain');run.config.parallelism=1
  for(const task of run.tasks)task.status='blocked'
  let unblock
  const gate=new Promise(r=>unblock=r)
  f.runtime.send=async()=>gate
  const a=f.controller.message('captain',run.tasks[0].id,'continue')
  const b=f.controller.message('captain',run.tasks[1].id,'continue')
  unblock();const results=await Promise.allSettled([a,b])
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
}))
test('failed question notification is durably retried',()=>fixture(async f=>{
  await f.controller.start('captain',f.config);await f.controller.tick()
  const task=f.controller.state('captain').tasks[0];let deliveries=0
  f.runtime.send=async(id)=>{if(id==='captain'&&++deliveries===1)throw new Error('Unavailable')}
  const q=await f.controller.question(task.sessionId,'Decision needed');q.lastNotifyAttemptAt='2000-01-01'
  await f.controller.tick();assert.ok(q.notifiedAt);assert.equal(deliveries,2)
}))
test('pending CI reuses current review and confirmed merge recovery does not re-review',()=>fixture(async f=>{
  let reviews=0
  const review=f.runtime.review
  f.runtime.review=async(...args)=>{reviews++;return review(...args)}
  f.runtime.isReviewCurrent=async()=>true
  f.setChecks(false)
  await f.controller.start('captain',{...f.config,parallelism:1});await f.controller.tick()
  const task=f.controller.state('captain').tasks[0]
  await f.controller.report(task.sessionId,{phase:'review',ready:true})
  await f.controller.tick();await f.controller.tick();assert.equal(reviews,1)
  f.provider.inspectPullRequest=async()=>({id:'1',url:'url',merged:true,headSha:'head',mergeSha:'merged',checksPassed:true})
  await f.controller.tick();assert.equal(reviews,1);assert.equal(task.status,'merged');assert.ok(task.closedAt)
}))
test('closure failure cannot advance to next milestone',()=>fixture(async f=>{
  f.setTickets([ticket('1'),ticket('2','M2')]);f.provider.close=async()=>{throw new Error('Temporary provider outage')}
  await f.controller.start('captain',{...f.config,parallelism:1});await f.controller.tick()
  const task=f.controller.state('captain').tasks[0]
  await f.controller.report(task.sessionId,{phase:'review',ready:true});await f.controller.tick();await f.controller.tick()
  assert.equal(task.status,'merged');assert.equal(task.closedAt,undefined);assert.equal(f.starts.length,1)
}))
test('cold restart restores existing workers without duplicate claims or sessions',()=>fixture(async f=>{
  await f.controller.start('captain',f.config);await f.controller.tick()
  const ids=f.controller.state('captain').tasks.map(t=>t.sessionId)
  await f.controller.dispose()
  const restored=[];f.runtime.restore=async task=>restored.push(task.sessionId)
  const next=new CaptainController(new RunStore(join(f.dir,'state')),f.runtime,()=>f.provider)
  try {await next.restore();await next.tick();assert.deepEqual(restored,ids);assert.equal(next.state('captain').tasks.length,2);assert.equal(f.starts.length,2)}finally{await next.dispose()}
}))
test('one shutdown failure does not leave other workers running or release ownership',()=>fixture(async f=>{
  await f.controller.start('captain',f.config);await f.controller.tick()
  const run=f.controller.state('captain'), stopped=[]
  f.runtime.stop=async id=>{stopped.push(id);if(id===run.tasks[0].sessionId)throw new Error('Archive failed')}
  try {
    try { await f.controller.control('captain','stop') } catch {}
    assert.ok(stopped.includes(run.tasks[1].sessionId));assert.match(run.error,/shutdown/i)
  } finally { f.runtime.stop=async()=>{} }
}))
