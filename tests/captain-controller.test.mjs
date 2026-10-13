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
  const starts=[],messages=[],merges=[],stops=[],running=new Set()
  const runtime={preflight:async()=>{},prepare:async(t)=>{t.baseSha='base'},start:async(t)=>{starts.push(t.id);running.add(t.sessionId)},send:async(id,text)=>messages.push({id,text}),stop:async(id,reason)=>{stops.push({id,reason});running.delete(id)},isRunning:async(id)=>running.has(id),review:async()=>({passed:passing,headSha:'head',report:'report.json',findings:passing?[]:['Fix bug']}),head:async()=> 'head'}
  const pr=()=>({id:'1',url:'https://example.com/pr',headSha:'head',merged:false,checksPassed:remoteChecks})
  const provider={preflight:async()=>{},discover:async()=>structuredClone(tickets),claim:async()=>{},ensurePullRequest:async()=>pr(),inspectPullRequest:async()=>pr(),merge:async(t)=>{merges.push(t.id);return {...pr(),merged:true,mergeSha:'merged'}},close:async(t)=>{const item=tickets.find(x=>x.id===t.ticket.id);if(item){item.state='closed';item.merged=true}},createFollowup:async()=> '9'}
  const controller=new CaptainController(new RunStore(join(dir,'state')),runtime,()=>provider)
  try {await fn({controller,runtime,provider,dir,starts,messages,merges,stops,config:config(dir),setTickets:v=>tickets=v,setPassing:v=>passing=v,setChecks:v=>remoteChecks=v})} finally {await controller.dispose();await rm(dir,{recursive:true,force:true})}
}

test('run Start arms the main loop and lifecycle controls never arm worker sessions',()=>fixture(async f=>{
  const calls=[];f.runtime.coordinatorLoop=async(run,action)=>calls.push([run.captainSessionId,action])
  const run=await f.controller.start('captain',f.config)
  assert.deepEqual(calls,[['captain','start']]);await f.controller.tick()
  await f.controller.control('captain','pause');await f.controller.control('captain','resume');await f.controller.control('captain','stop')
  assert.deepEqual(calls.map(c=>c[1]),['start','pause','resume','stop'])
  assert.ok(calls.every(c=>c[0]===run.captainSessionId))
}))

test('loop admission failure leaves no run or worker behind',()=>fixture(async f=>{
  f.runtime.coordinatorLoop=async()=>{throw new Error('Unrelated goal')}
  await assert.rejects(f.controller.start('captain',f.config),/Unrelated/)
  assert.equal(f.controller.state('captain'),null);await f.controller.tick();assert.equal(f.starts.length,0)
}))

test('coordinator wait is authorized only in the leader after pending questions are answered',()=>fixture(async f=>{
  const actions=[];f.runtime.coordinatorLoop=async(_run,action)=>actions.push(action)
  const run=await f.controller.start('captain',f.config);await f.controller.tick()
  await assert.rejects(f.controller.wait(run.tasks[0].sessionId),/captain/)
  const q=await f.controller.question(run.tasks[0].sessionId,'Which path?')
  await assert.rejects(f.controller.wait('captain'),/pending worker questions/)
  await f.controller.answer('captain',q.id,'Current conventions')
  const before=f.messages.length;await f.controller.wait('captain');assert.equal(f.messages.length,before);assert.equal(actions.at(-1),'wait')
}))

test('failed native loop completion cannot prevent Stop from cancelling workers',()=>fixture(async f=>{
  f.runtime.coordinatorLoop=async(_run,action)=>{if(action==='stop')throw new Error('Goal durability failure')}
  const run=await f.controller.start('captain',f.config);await f.controller.tick()
  await f.controller.control('captain','stop')
  assert.equal(run.status,'stopped');assert.ok(run.tasks.every(t=>t.status==='cancelled'));assert.match(run.coordinatorLoopError,/durability/)
}))

test('worker view contains only its task, origin and questions; controls stay coordinator-owned',()=>fixture(async f=>{
  const run=await f.controller.start('captain',f.config);await f.controller.tick()
  const task=run.tasks[0]
  const worker=f.controller.view(task.sessionId)
  assert.equal(worker.role,'worker');assert.equal(worker.coordinatorSessionId,'captain')
  assert.deepEqual(worker.run.tasks.map(t=>t.id),[task.id]);assert.deepEqual(worker.run.tickets.map(t=>t.id),[task.ticket.id])
  assert.equal(f.controller.view('captain').role,'coordinator');assert.equal(f.controller.view('other').run,null)
  await assert.rejects(f.controller.control(task.sessionId,'stop'),/captain/)
}))

test('stopped configuration saves future settings without waking workers or altering existing contracts',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,ticketIds:['1'],maxTickets:1});await f.controller.tick()
  const task=run.tasks[0],oldCommands=[...run.config.verifyCommands],ids=[task.id,task.sessionId,run.id]
  await f.controller.control('captain','stop');const starts=f.starts.length
  const stoppedAt=run.stoppedAt??run.updatedAt
  await f.controller.configure('captain',{...run.config,ticketIds:undefined,maxTickets:0,parallelism:1,verifyCommands:['new gate']})
  assert.equal(run.status,'stopped');assert.equal(run.config.maxTickets,0);assert.equal(run.config.ticketIds,undefined);assert.equal(f.starts.length,starts)
  assert.equal(run.stoppedAt,stoppedAt)
  assert.deepEqual(task.assignmentConfig.verifyCommands,oldCommands);assert.deepEqual([task.id,task.sessionId,run.id],ids)
  await f.controller.control('captain','resume');await f.controller.tick()
  let reviewed=[];f.runtime.review=async(t,c)=>{reviewed.push(c.verifyCommands);return{passed:true,headSha:'head',findings:[],report:'pass'}}
  await f.controller.report(task.sessionId,{phase:'testing',ready:true});await f.controller.tick()
  assert.deepEqual(reviewed,[oldCommands]);assert.equal(task.status,'merged')
  const next=run.tasks.find(t=>t.ticket.id==='2');assert.deepEqual(next.assignmentConfig.verifyCommands,['new gate'])
}))

test('configuration is coordinator-only, stopped-only and cannot redirect existing task identities',()=>fixture(async f=>{
  const run=await f.controller.start('captain',f.config);await f.controller.tick()
  await assert.rejects(f.controller.configure('captain',run.config),/stopped/i)
  await f.controller.control('captain','stop')
  await assert.rejects(f.controller.configure(run.tasks[0].sessionId,run.config),/captain/i)
  for(const patch of [{repository:'other/repo'},{provider:'azure',organization:'https://dev.azure.com/org',project:'project'},{workspace:join(f.dir,'elsewhere')},{remote:'other'},{targetBranch:'other'}])await assert.rejects(f.controller.configure('captain',{...run.config,...patch}),/identity|same run/i)
  await assert.rejects(f.controller.configure('captain',{...run.config,parallelism:0}),/parallelism/)
}))

test('saving configuration rejects concurrent Resume and leaves existing settings intact',()=>fixture(async f=>{
  const run=await f.controller.start('captain',f.config);await f.controller.tick();await f.controller.control('captain','stop')
  let release,entered;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r)
  f.runtime.isRunning=async()=>{entered();await gate;return false}
  const pending=f.controller.configure('captain',{...run.config,parallelism:7});await started
  await f.controller.control('captain','resume');release()
  await assert.rejects(pending,/changed|stopped/i);assert.equal(run.config.parallelism,2)
}))

test('explicit human parked-task resumption raises its team resource cap without changing original gates',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:1,maxTaskMinutes:480});await f.controller.tick()
  const task=run.tasks[0],commands=[...task.assignmentConfig.verifyCommands]
  await f.controller.report(task.sessionId,{phase:'blocked',blocked:true,note:'Missing prerequisite'});task.blockedSince=new Date(Date.now()-3601000).toISOString();await f.controller.tick()
  run.config.maxTeamMembers=5
  await f.controller.resumeTask('captain',task.id,'The .NET issue is resolved; human permits five team members.',true,5)
  assert.equal(task.assignmentConfig.maxTeamMembers,5);assert.deepEqual(task.assignmentConfig.verifyCommands,commands);assert.equal(task.assignmentConfig.maxTaskMinutes,480)
  assert.ok(Date.parse(task.budgetStartedAt)>=Date.now()-1000)
}))

test('one explicit human window continues a budget-failed assignment without replacing identity or elapsed history',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:2,maxTaskMinutes:480});await f.controller.tick()
  const task=run.tasks[0], identity=[task.id,task.sessionId,task.worktree,task.attempt], originalConfig=structuredClone(task.assignmentConfig)
  task.startedAt=new Date(Date.now()-9*3600000).toISOString();const started=task.startedAt
  await f.controller.tick();assert.equal(task.status,'failed');assert.equal(task.error,'Task time budget exhausted')
  assert.equal(f.stops.findLast(s=>s.id===task.sessionId).reason,'shutdown','Time expiry must preserve the Original team for an explicitly authorized future window')
  const failedAt=task.finishedAt, history=structuredClone(task.phases), starts=f.starts.length
  await f.controller.resumeTask('captain',task.id,'Human approved one new eight-hour window for this same assignment.',true)
  assert.equal(task.status,'running');assert.equal(f.starts.length,starts+1)
  assert.deepEqual([task.id,task.sessionId,task.worktree,task.attempt],identity);assert.equal(task.startedAt,started)
  assert.deepEqual(task.assignmentConfig,originalConfig);assert.equal(task.assignmentConfig.maxTaskMinutes,480)
  assert.ok(Date.parse(task.budgetStartedAt)>=Date.now()-1000);assert.equal(task.finishedAt,undefined)
  assert.deepEqual(task.phases.slice(0,history.length),history);assert.ok(task.phases.some(p=>p.note?.includes(failedAt)))
}))

test('failed assignments cannot receive a budget reset from automation or unrelated human failures',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0]
  await f.runtime.stop(task.sessionId);task.status='failed';task.error='Task time budget exhausted';task.finishedAt=new Date().toISOString();task.startedAt=new Date(Date.now()-3600000).toISOString()
  await assert.rejects(f.controller.resumeTask('captain',task.id,'Automatic retry',false),/Resume requires/)
  task.error='CI checks failed';await assert.rejects(f.controller.resumeTask('captain',task.id,'Human retry',true),/Resume requires/)
  assert.equal(task.budgetStartedAt,undefined);assert.equal(task.status,'failed')
}))

test('explicit assigned-task resume reaches its worker without tracker discovery or a second claim',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:1,maxTaskMinutes:480});await f.controller.tick()
  const task=run.tasks[0];await f.controller.report(task.sessionId,{phase:'blocked',blocked:true,note:'External prerequisite'})
  task.blockedSince=new Date(Date.now()-3601000).toISOString();await f.controller.tick();assert.equal(task.status,'parked')
  f.provider.discover=async()=>{throw new Error('Tracker offline')};f.provider.claim=async()=>{throw new Error('Unexpected duplicate claim')}
  const starts=f.starts.length,identity=[task.id,task.sessionId,task.worktree]
  await f.controller.resumeTask('captain',task.id,'Human resolved the prerequisite',true)
  assert.equal(task.status,'running');assert.equal(f.starts.length,starts+1)
  assert.deepEqual([task.id,task.sessionId,task.worktree],identity)
  await f.controller.tick();assert.equal(f.starts.length,starts+1);assert.match(run.error,/Tracker offline/)
}))

test('a short human retry reason is accepted for an idle waiting worker and remains distinct from model recovery',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick()
  const task=run.tasks[0];await f.controller.report(task.sessionId,{phase:'waiting',note:'Prior wait'});await f.runtime.stop(task.sessionId)
  const starts=f.starts.length;await f.controller.resumeTask('captain',task.id,'solved',true)
  assert.equal(f.starts.length,starts+1);assert.equal(task.status,'running');assert.equal(task.pendingHumanRetry.reason,'solved')
  assert.equal(task.pendingHumanRetry.previousBlocker,'Prior wait')
}))

for(const action of ['wait','resume'])test(`human task resumption supersedes only the older pending answered ${action} intent`,()=>fixture(async f=>{
 const run=await f.controller.start('captain',{...f.config,maxTickets:2});await f.controller.tick();const task=run.tasks[0],other=run.tasks[1]
 await f.runtime.stop(task.sessionId);await f.controller.report(task.sessionId,{phase:'blocked',note:'Original hold'})
 f.runtime.assertCaptainDiagnostics=async()=>{throw Error('Genuine diagnostics not yet complete')}
 const q=await f.controller.question(task.sessionId,'Older question'),unanswered=await f.controller.question(task.sessionId,'Unanswered question')
 await assert.rejects(f.controller.answer('captain',q.id,'Older decision',action),/diagnostics/)
 await f.runtime.stop(other.sessionId);await f.controller.report(other.sessionId,{phase:'blocked',note:'Other owner hold'});const foreign=await f.controller.question(other.sessionId,'Other owner question')
 await assert.rejects(f.controller.answer('captain',foreign.id,'Other pending intent','wait'),/diagnostics/)
 const before={answer:q.answer,action:q.action,answeredAt:q.answeredAt},identity=[task.id,task.sessionId,task.worktree,task.attempt]
 f.runtime.assertCaptainDiagnostics=async()=>{};await f.controller.resumeTask('captain',task.id,'Human authorizes one normal same-owner retry',true)
 assert.ok(q.supersededAt);assert.ok(q.recordedAt);assert.match(q.supersededReason,/human.*resum/i);assert.deepEqual({answer:q.answer,action:q.action,answeredAt:q.answeredAt},before)
 assert.equal(unanswered.answer,undefined);assert.equal(unanswered.recordedAt,undefined);assert.equal(foreign.supersededAt,undefined);assert.equal(foreign.recordedAt,undefined)
 await f.controller.tick();assert.equal(f.messages.some(m=>m.id===task.sessionId&&m.text.includes(`Captain answer to ${q.id}`)),false)
 assert.deepEqual([task.id,task.sessionId,task.worktree,task.attempt],identity)
 const count=f.messages.length;await f.controller.answer('captain',q.id,'Older decision',action);assert.equal(f.messages.length,count,'Idempotent superseded answer must not replay')
}))

test('a fresh answer after human supersession can reassert WAIT without rewriting old answer evidence',()=>fixture(async f=>{
 const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0]
 await f.runtime.stop(task.sessionId);await f.controller.report(task.sessionId,{phase:'blocked',note:'Prior hold'});const q=await f.controller.question(task.sessionId,'Older budget question')
 f.runtime.assertCaptainDiagnostics=async()=>{throw Error('Diagnostics incomplete')};await assert.rejects(f.controller.answer('captain',q.id,'Old WAIT','wait'),/Diagnostics/)
 f.runtime.assertCaptainDiagnostics=async()=>{};await f.controller.resumeTask('captain',task.id,'New explicit human retry',true)
 const oldVersion=q.answerVersion;await f.controller.answer('captain',q.id,'NEW WAIT: acceptance prerequisite still unmet','wait')
 assert.equal(q.supersededAt,undefined);assert.equal(q.supersededReason,undefined);assert.ok(q.answerVersion>oldVersion);assert.ok(q.deliveredAt)
 assert.ok(f.messages.some(m=>m.id===task.sessionId&&m.text.includes('NEW WAIT')));assert.equal(task.phase,'waiting')
 assert.equal(q.supersededAnswers[0].answer,'Old WAIT');assert.equal(q.supersededAnswers[0].action,'wait');assert.equal(q.supersededAnswers[0].answerVersion,oldVersion)
}))

test('superseded idempotent WAIT cannot cancel a queued human retry but a genuinely new WAIT can',()=>fixture(async f=>{
 const run=await f.controller.start('captain',{...f.config,maxTickets:2});await f.controller.tick();const task=run.tasks[0]
 await f.runtime.stop(task.sessionId);await f.controller.report(task.sessionId,{phase:'blocked',note:'Prior hold'});const q=await f.controller.question(task.sessionId,'Old capacity question')
 f.runtime.assertCaptainDiagnostics=async()=>{throw Error('Diagnostics incomplete')};await assert.rejects(f.controller.answer('captain',q.id,'Old WAIT','wait'),/Diagnostics/)
 run.config.parallelism=1;await f.controller.resumeTask('captain',task.id,'Explicit human retry queued behind other owner',true)
 assert.equal(task.resumeRequested,true);const budget=task.budgetStartedAt;await f.controller.answer('captain',q.id,'Old WAIT','wait');assert.equal(task.resumeRequested,true)
 await assert.rejects(f.controller.answer('captain',q.id,'New WAIT: prerequisite is still unavailable','wait'),/Diagnostics/)
 assert.equal(task.resumeRequested,undefined);assert.equal(task.budgetStartedAt,budget);assert.equal(q.supersededAt,undefined);assert.equal(task.status,'blocked')
}))

test('a newer WAIT arriving during human resumption validation is not superseded',()=>fixture(async f=>{
 const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0]
 await f.runtime.stop(task.sessionId);await f.controller.report(task.sessionId,{phase:'blocked',note:'Prior hold'});const q=await f.controller.question(task.sessionId,'Same question')
 f.runtime.assertCaptainDiagnostics=async()=>{throw Error('Diagnostics incomplete')};await assert.rejects(f.controller.answer('captain',q.id,'Old WAIT','wait'),/Diagnostics/)
 let once=false;const running=f.runtime.isRunning;f.runtime.isRunning=async id=>{if(!once&&id===task.sessionId){once=true;await assert.rejects(f.controller.answer('captain',q.id,'Newer WAIT during validation','wait'),/Diagnostics/);return false}return running(id)}
 await assert.rejects(f.controller.resumeTask('captain',task.id,'Human request predates the newer WAIT',true),/changed/i)
 assert.equal(q.answer,'Newer WAIT during validation');assert.equal(q.supersededAt,undefined);assert.equal(task.pendingHumanRetry,undefined);assert.equal(task.budgetStartedAt,undefined)
}))

test('in-flight old diagnostic answer cannot replay after explicit human resumption',()=>fixture(async f=>{
 const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0]
 await f.runtime.stop(task.sessionId);await f.controller.report(task.sessionId,{phase:'blocked',note:'Prior hold'});const q=await f.controller.question(task.sessionId,'Delayed answer')
 let release,enter;const gate=new Promise(r=>release=r),entered=new Promise(r=>enter=r);f.runtime.assertCaptainDiagnostics=async()=>{enter();await gate}
 const old=f.controller.answer('captain',q.id,'Obsolete delayed WAIT','wait');await entered
 try{await f.controller.resumeTask('captain',task.id,'Explicit human continuation',true)}finally{release();await old}
 await f.controller.tick();assert.equal(f.messages.some(m=>m.id===task.sessionId&&m.text.includes('Obsolete delayed WAIT')),false);assert.ok(q.supersededAt);assert.equal(q.deliveredAt,undefined)
}))

test('human supersession revokes an old answer waiting at native transport admission',()=>fixture(async f=>{
 const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0]
 await f.controller.report(task.sessionId,{phase:'waiting',note:'Idle original owner'});await f.runtime.stop(task.sessionId);const q=await f.controller.question(task.sessionId,'Delayed transport question')
 let release,enter;const gate=new Promise(r=>release=r),entered=new Promise(r=>enter=r),send=f.runtime.send
 f.runtime.send=async(id,text,key,permitted)=>{if(text.includes('Obsolete transport WAIT')){enter();await gate;if(permitted&&!permitted())return false}return send(id,text,key,permitted)}
 const old=f.controller.answer('captain',q.id,'Obsolete transport WAIT','wait');await entered
 try{await f.controller.resumeTask('captain',task.id,'Explicit normal human resumption',true)}finally{release();await old}
 assert.equal(f.messages.some(m=>m.id===task.sessionId&&m.text.includes('Obsolete transport WAIT')),false);assert.ok(q.supersededAt);assert.equal(q.deliveredAt,undefined);assert.equal(task.status,'running')
}))

test('human retry clears only the current stale budget error after preserving its blocker history',()=>fixture(async f=>{
 const run=await f.controller.start('captain',{...f.config,maxTickets:1,maxTaskMinutes:480});await f.controller.tick();const task=run.tasks[0]
 await f.runtime.stop(task.sessionId);await f.controller.report(task.sessionId,{phase:'blocked',note:'Task time budget exhausted'});const history=structuredClone(task.phases),identity=[task.id,task.sessionId,task.startedAt]
 await f.controller.resumeTask('captain',task.id,'Human approved one normal bounded retry',true)
 assert.equal(task.error,undefined);assert.equal(task.pendingHumanRetry.previousBlocker,'Task time budget exhausted');assert.deepEqual(task.phases.slice(0,history.length),history);assert.deepEqual([task.id,task.sessionId,task.startedAt],identity);assert.equal(task.assignmentConfig.maxTaskMinutes,480)
 await f.runtime.stop(task.sessionId);await f.controller.report(task.sessionId,{phase:'blocked',note:'Unresolved genuine CI failure'});await f.controller.resumeTask('captain',task.id,'Explicit retry with unchanged final gates',true)
 assert.equal(task.error,'Unresolved genuine CI failure','Other current failures must not be cleared by the budget projection fix')
}))

test('human resume dispatch is independent of an already pending discovery request',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:1,maxTaskMinutes:480});await f.controller.tick()
  const task=run.tasks[0];await f.controller.report(task.sessionId,{phase:'blocked',blocked:true,note:'Prerequisite'})
  task.blockedSince=new Date(Date.now()-3601000).toISOString();await f.controller.tick()
  let release,entered;const enteredDiscovery=new Promise(r=>entered=r),pending=new Promise(r=>release=r)
  f.provider.discover=async()=>{entered();await pending;return []}
  const tick=f.controller.tick();await enteredDiscovery;const starts=f.starts.length
  try{await f.controller.resumeTask('captain',task.id,'Explicit human retry',true);assert.equal(f.starts.length,starts+1);assert.equal(task.status,'running')}
  finally{release();await tick}
  assert.equal(f.starts.length,starts+1)
}))

test('Stop drains direct resume admission and prevents a late start from reviving work',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:1,maxTaskMinutes:480});await f.controller.tick()
  const task=run.tasks[0];await f.controller.report(task.sessionId,{phase:'blocked',blocked:true,note:'Prerequisite'});task.blockedSince=new Date(Date.now()-3601000).toISOString();await f.controller.tick()
  let release,entered;const preparing=new Promise(r=>entered=r),pending=new Promise(r=>release=r)
  f.runtime.prepare=async()=>{entered();await pending}
  const starts=f.starts.length,resume=f.controller.resumeTask('captain',task.id,'Human retry',true);await preparing
  const stop=f.controller.control('captain','stop');assert.equal(run.status,'stopped');release();await Promise.all([resume,stop])
  assert.equal(f.starts.length,starts);assert.equal(task.status,'cancelled')
}))

test('discovery completing during direct resume cannot claim or launch the same task twice',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:1,maxTaskMinutes:480});await f.controller.tick()
  const task=run.tasks[0];await f.controller.report(task.sessionId,{phase:'blocked',blocked:true,note:'Prerequisite'});task.blockedSince=new Date(Date.now()-3601000).toISOString();await f.controller.tick()
  let releaseDiscovery,enteredDiscovery,releasePrepare,enteredPrepare
  const discoveryEntered=new Promise(r=>enteredDiscovery=r),discoveryGate=new Promise(r=>releaseDiscovery=r)
  const prepareEntered=new Promise(r=>enteredPrepare=r),prepareGate=new Promise(r=>releasePrepare=r)
  f.provider.discover=async()=>{enteredDiscovery();await discoveryGate;return []}
  let claims=0,prepares=0;f.provider.claim=async()=>claims++
  f.runtime.prepare=async()=>{prepares++;enteredPrepare();await prepareGate}
  const starts=f.starts.length,tick=f.controller.tick();await discoveryEntered
  const resume=f.controller.resumeTask('captain',task.id,'Human retry',true);await prepareEntered
  releaseDiscovery();await new Promise(r=>setTimeout(r,20));releasePrepare();await Promise.all([tick,resume])
  assert.equal(claims,0);assert.equal(prepares,1);assert.equal(f.starts.length,starts+1)
}))

test('Pause during direct resume validation defers admission without losing the request',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:1,maxTaskMinutes:480});await f.controller.tick()
  const task=run.tasks[0];await f.controller.report(task.sessionId,{phase:'blocked',blocked:true,note:'Prerequisite'});task.blockedSince=new Date(Date.now()-3601000).toISOString();await f.controller.tick()
  let release,entered;const preparing=new Promise(r=>entered=r),pending=new Promise(r=>release=r)
  f.runtime.prepare=async()=>{entered();await pending}
  const starts=f.starts.length,resume=f.controller.resumeTask('captain',task.id,'Human retry',true);await preparing
  await f.controller.control('captain','pause');release();await resume
  assert.equal(f.starts.length,starts);assert.equal(task.status,'blocked');assert.equal(task.resumeRequested,true)
  f.provider.discover=async()=>{throw new Error('Offline')};await f.controller.control('captain','resume');await f.controller.tick()
  assert.equal(f.starts.length,starts+1);assert.equal(task.status,'running')
}))

test('automatic direct resume cannot renew or bypass an expired assignment budget',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:1,maxTaskMinutes:120});await f.controller.tick()
  const task=run.tasks[0];await f.controller.report(task.sessionId,{phase:'blocked',blocked:true,note:'Prerequisite'});task.blockedSince=new Date(Date.now()-3601000).toISOString();await f.controller.tick()
  task.budgetStartedAt=new Date(Date.now()-4*3600000).toISOString();task.phases=[{phase:'parked',at:new Date(Date.now()-3600000).toISOString()}]
  const starts=f.starts.length;f.provider.discover=async()=>{throw new Error('Offline')}
  await f.controller.resumeTask('captain',task.id,'Changed evidence',false)
  assert.equal(f.starts.length,starts);assert.equal(task.status,'failed');assert.match(task.error,/budget exhausted/)
}))

test('offline dispatch refreshes stale blocked activity before enforcing capacity',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:1,parallelism:1});await f.controller.tick()
  const task=run.tasks[0];await f.controller.report(task.sessionId,{phase:'blocked',blocked:true,note:'Old activity'})
  await f.controller.control('captain','stop');await f.controller.control('captain','resume')
  task.executionActive=true // A legacy saved run can still contain report-time activity after Stop.
  f.provider.discover=async()=>{throw new Error('Offline')}
  const starts=f.starts.length;await f.controller.tick()
  assert.equal(f.starts.length,starts+1);assert.equal(task.status,'running')
}))

test('another idle blocked worker cannot retain a stale capacity slot when discovery is offline',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:2,maxTaskMinutes:480});await f.controller.tick()
  const [first,second]=run.tasks
  await f.controller.report(first.sessionId,{phase:'blocked',blocked:true,note:'Prerequisite'});first.blockedSince=new Date(Date.now()-3601000).toISOString();await f.controller.tick()
  await f.controller.report(second.sessionId,{phase:'blocked',blocked:true,note:'Another blocker'});await f.runtime.stop(second.sessionId)
  await f.controller.control('captain','parallelism',1);f.provider.discover=async()=>{throw new Error('Offline')}
  const starts=f.starts.length;await f.controller.resumeTask('captain',first.id,'solved',true)
  assert.equal(second.executionActive,false);assert.equal(first.status,'running');assert.equal(f.starts.length,starts+1)
}))

test('direct resume rechecks the budget after asynchronous local preparation',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:1,maxTaskMinutes:120});await f.controller.tick()
  const task=run.tasks[0];await f.controller.report(task.sessionId,{phase:'blocked',blocked:true,note:'Prerequisite'});task.blockedSince=new Date(Date.now()-3601000).toISOString();await f.controller.tick()
  f.runtime.prepare=async()=>{task.budgetStartedAt=new Date(Date.now()-4*3600000).toISOString()}
  const starts=f.starts.length;await f.controller.resumeTask('captain',task.id,'Explicit human retry',true)
  assert.equal(f.starts.length,starts);assert.equal(task.status,'failed');assert.match(task.error,/budget exhausted/)
}))

test('team resource overrides require human resumption within the configured run cap',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:1,maxTaskMinutes:480});await f.controller.tick()
  const task=run.tasks[0];await f.controller.report(task.sessionId,{phase:'blocked',blocked:true,note:'External hold'});task.blockedSince=new Date(Date.now()-3601000).toISOString();await f.controller.tick();run.config.maxTeamMembers=5
  for(const [human,limit] of [[false,5],[true,6],[true,0],[true,1]])await assert.rejects(f.controller.resumeTask('captain',task.id,'New evidence',human,limit),/team|human|limit/i)
  assert.equal(task.status,'parked');assert.equal(task.assignmentConfig.maxTeamMembers,2)
}))

test('blocking over one hour parks without archiving, frees capacity, and does not unlock dependencies',()=>fixture(async f=>{
  f.setTickets([ticket('1'),ticket('2'),ticket('4','M1',['1']),ticket('3','M2')])
  const run=await f.controller.start('captain',{...f.config,parallelism:1,maxTaskMinutes:480});await f.controller.tick()
  const task=run.tasks[0],stops=[]
  f.runtime.stop=async(id,reason)=>{stops.push(reason);f.runtime.isRunning=async()=>false}
  await f.controller.report(task.sessionId,{phase:'blocked',blocked:true,note:'External evidence unavailable'})
  task.blockedSince=new Date(Date.now()-3601000).toISOString()
  await f.controller.tick()
  assert.equal(task.status,'parked');assert.equal(task.executionActive,false);assert.equal(task.finishedAt,undefined)
  assert.deepEqual(stops,['shutdown']);assert.deepEqual(run.tasks.map(t=>t.ticket.id),['1','2'])
  const before=f.messages.length;await f.controller.tick();assert.equal(f.messages.length,before)
  await assert.rejects(f.controller.report(task.sessionId,{phase:'analysis'}),/worker/)
  await f.controller.message('captain',task.id,'Still waiting','wait');assert.equal(task.status,'parked')
  await assert.rejects(f.controller.message('captain',task.id,'Generic retry','resume'),/parked/i)
}))

test('repeated blocked reports do not reset the contiguous block clock and human resume retains identity',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:1,maxTaskMinutes:480});await f.controller.tick()
  const task=run.tasks[0]
  await f.controller.report(task.sessionId,{phase:'blocked',blocked:true,note:'Missing prerequisite'})
  task.blockedSince=new Date(Date.now()-3601000).toISOString();const since=task.blockedSince
  await f.controller.report(task.sessionId,{phase:'blocked',blocked:true,note:'Still missing prerequisite'})
  assert.equal(task.blockedSince,since);await f.controller.tick();assert.equal(task.status,'parked')
  task.startedAt=new Date(Date.now()-86400000).toISOString()
  task.phases=[{phase:'parked',at:task.startedAt}]
  const id=task.sessionId
  await f.controller.resumeTask('captain',task.id,'Human supplied the missing prerequisite',true)
  await f.controller.tick();assert.equal(task.sessionId,id);assert.equal(task.status,'running');assert.equal(task.blockedSince,undefined)
}))

test('blocked clocks migrate from phase evidence and only genuine progress clears them',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:1,maxTaskMinutes:480});await f.controller.tick()
  const task=run.tasks[0];await f.controller.report(task.sessionId,{phase:'blocked',blocked:true,note:'Waiting'})
  delete task.blockedSince;task.phases.at(-1).at=new Date(Date.now()-3601000).toISOString()
  await f.controller.tick();assert.equal(task.status,'parked')
}))

test('parking revokes guidance awaiting diagnostics and prevents a late worker wake',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:1,maxTaskMinutes:480});await f.controller.tick()
  const task=run.tasks[0];await f.controller.report(task.sessionId,{phase:'blocked',blocked:true,note:'Missing prerequisite'})
  let release,entered;const enteredGate=new Promise(r=>entered=r),gate=new Promise(r=>release=r)
  f.runtime.assertCaptainDiagnostics=async()=>{entered();await gate}
  const late=f.controller.message('captain',task.id,'Changed evidence','resume');await enteredGate
  task.blockedSince=new Date(Date.now()-3601000).toISOString();await f.controller.tick()
  const before=f.messages.filter(m=>m.id===task.sessionId).length;release()
  await assert.rejects(late,/changed|parked/i)
  assert.equal(task.status,'parked');assert.equal(f.messages.filter(m=>m.id===task.sessionId).length,before)
}))

test('native team descendants inherit a read-only origin view without activating a new coordinator',()=>fixture(async f=>{
  const run=await f.controller.start('captain',f.config);await f.controller.tick()
  f.runtime.parentSession=async id=>id==='member'?run.tasks[0].sessionId:null
  const view=await f.controller.sessionView('member')
  assert.equal(view.role,'worker');assert.equal(view.coordinatorSessionId,'captain');assert.equal(view.run.tasks.length,1)
  assert.equal(f.controller.state('member'),null)
}))

test('another chat created in an assigned task workspace has origin visibility without coordinator powers',()=>fixture(async f=>{
  const run=await f.controller.start('captain',f.config);await f.controller.tick()
  f.runtime.workspacePath=async id=>id==='followup-chat'?run.tasks[0].worktree:f.config.workspace
  const view=await f.controller.sessionView('followup-chat')
  assert.equal(view.role,'worker');assert.equal(view.run.tasks[0].id,run.tasks[0].id)
  assert.equal((await f.controller.sessionView('ordinary-main-repo-chat')).run,null)
  await assert.rejects(f.controller.control('followup-chat','stop'),/captain/)
}))

test('parking never prevents reconciliation of an already merged exact reviewed PR',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:1,maxTaskMinutes:480});await f.controller.tick()
  const task=run.tasks[0]
  await f.controller.report(task.sessionId,{phase:'blocked',blocked:true,note:'Merge acknowledgement unavailable'})
  task.blockedSince=new Date(Date.now()-3601000).toISOString();task.prUrl='https://example.com/pr';task.headSha='head';task.reviewHistory=[{passed:true,headSha:'head',at:new Date().toISOString(),findings:[],report:'pass'}]
  f.provider.inspectPullRequest=async()=>({id:'1',url:task.prUrl,headSha:'head',merged:true,mergeSha:'merged',checksPassed:true})
  await f.controller.tick();assert.equal(task.status,'merged');assert.ok(task.closedAt)
}))

test('parked tasks survive Stop/Resume and failed quiescence reserves capacity',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,parallelism:1,maxTaskMinutes:480});await f.controller.tick()
  const task=run.tasks[0];await f.controller.report(task.sessionId,{phase:'blocked',blocked:true,note:'External prerequisite'})
  task.blockedSince=new Date(Date.now()-3601000).toISOString()
  const stop=f.runtime.stop;f.runtime.stop=async()=>{throw new Error('Cannot quiesce')}
  await f.controller.tick();assert.equal(task.status,'parked');assert.equal(task.executionActive,true);assert.equal(run.tasks.length,1)
  await assert.rejects(f.controller.resumeTask('captain',task.id,'Human retry',true),/quiesce/)
  f.runtime.stop=stop;await f.controller.tick();assert.equal(task.executionActive,false);assert.equal(run.tasks.length,2)
  await f.controller.control('captain','stop');await f.controller.control('captain','resume')
  assert.equal(task.status,'parked');assert.equal(task.resumeRequested,undefined)
}))

test('slow review in one repository cannot stall another coordinator or its stop',()=>fixture(async f=>{
  const a=await f.controller.start('a',{...f.config,parallelism:1,maxTickets:1});await f.controller.tick()
  await f.controller.report(a.tasks[0].sessionId,{phase:'review',ready:true})
  let release,entered;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r)
  f.runtime.review=async()=>{entered();await gate;return{passed:true,headSha:'head',report:'pass',findings:[]}}
  const slow=f.controller.tick();await started
  try {
    const b=await f.controller.start('b',{...f.config,repository:'other/repo',parallelism:1,maxTickets:1})
    const next=f.controller.tick()
    await new Promise(r=>setTimeout(r,50));assert.equal(b.tasks.length,1)
    await Promise.race([f.controller.control('b','stop'),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Other run blocked stop')),500))])
    release();await Promise.all([slow,next])
  } finally {release();await slow}
}))
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

test('blocked workers keep their teams and unchanged blockers never trigger assignment retries or duplicate notices',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0]
  const stops=[];f.runtime.stop=async id=>stops.push(id)
  await f.controller.report(task.sessionId,{phase:'blocked',blocked:true,note:'Native fixture requires verified assessment'})
  await f.controller.report(task.sessionId,{phase:'blocked',blocked:true,note:'Native fixture requires verified assessment'})
  task.lastWakeAt='2000-01-01';await f.controller.tick();await f.controller.tick()
  assert.deepEqual(stops,[]);assert.equal(f.starts.length,1)
  assert.equal(f.messages.filter(m=>m.id==='captain').length,1);assert.equal(task.error,'Native fixture requires verified assessment')
}))

test('idle waiting teams enter a single hold without resending assignments',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0]
  await f.controller.report(task.sessionId,{phase:'waiting',note:'Original members are working; waiting for their reports'})
  f.runtime.isRunning=async()=>false;task.lastWakeAt='2000-01-01'
  await f.controller.tick();await f.controller.tick();assert.equal(f.starts.length,1);assert.equal(task.phase,'blocked');assert.equal(f.messages.filter(m=>m.id==='captain').length,1)
}))

test('acknowledged questions and delivered answers are not repeatedly sent',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0]
  const q=await f.controller.question(task.sessionId,'Which safe source-only task can proceed?')
  q.lastNotifyAttemptAt='2000-01-01';await f.controller.tick()
  assert.equal(f.messages.filter(m=>m.id==='captain').length,1)
  await f.controller.answer('captain',q.id,'Continue the documentation draft')
  await f.controller.answer('captain',q.id,'Continue the documentation draft')
  assert.equal(f.messages.filter(m=>m.id===task.sessionId).length,1)
}))

test('identical captain guidance cannot repeatedly wake a parked worker',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0]
  await f.controller.message('captain',task.id,'Use the existing team and preserve the execution hold')
  await f.controller.message('captain',task.id,'Use the existing team and preserve the execution hold')
  assert.equal(f.messages.filter(m=>m.id===task.sessionId).length,1)
}))

test('idle workers receive one checkpoint then notify the captain without repeated launches',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0]
  f.runtime.isRunning=async()=>false;task.lastWakeAt='2000-01-01';await f.controller.tick()
  assert.equal(f.starts.length,2);assert.ok(task.idleCheckpointAt)
  task.lastWakeAt='2000-01-01';await f.controller.tick();await f.controller.tick()
  assert.equal(f.starts.length,2);assert.equal(task.status,'blocked');assert.equal(f.messages.filter(m=>m.id==='captain').length,1)
}))

test('blocked descendant activity retains capacity and wait guidance preserves the blocker',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:2,parallelism:1});await f.controller.tick();const task=run.tasks[0]
  await f.controller.report(task.sessionId,{phase:'blocked',blocked:true,note:'Current fixture blocked; independent member still working'})
  await f.controller.tick();assert.equal(run.tasks.length,1)
  await f.controller.message('captain',task.id,'Keep the native execution hold','wait')
  assert.equal(task.status,'blocked');assert.match(task.error,/Current fixture blocked/)
  f.runtime.isRunning=async()=>false;await f.controller.tick()
  assert.equal(run.tasks.length,2);assert.equal(task.executionActive,false)
}))

test('reporting a blocker cannot free a live execution slot during activity measurement',()=>fixture(async f=>{
  const run=await f.controller.start('captain',f.config);await f.controller.tick();run.config.parallelism=1;run.tasks[1].status='blocked'
  let release;const gate=new Promise(r=>release=r);f.runtime.isRunning=async()=>gate
  const report=f.controller.report(run.tasks[0].sessionId,{phase:'blocked',blocked:true,note:'Hold current execution'})
  const rejected=assert.rejects(f.controller.message('captain',run.tasks[1].id,'Resume the other task'),/slot/i)
  release(true);await Promise.all([report,rejected])
}))

test('a newer ready report survives an in-flight guidance delivery',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0]
  await f.controller.report(task.sessionId,{phase:'blocked',blocked:true,note:'Old blocker'})
  let release,entered;const gate=new Promise(r=>release=r),sending=new Promise(r=>entered=r);f.runtime.send=async()=>{entered();return gate}
  const guidance=f.controller.message('captain',task.id,'Proceed with the verified new solution','resume')
  await sending
  await f.controller.report(task.sessionId,{phase:'review',ready:true,note:'New verification completed'})
  release();await guidance;assert.equal(task.status,'ready');assert.equal(task.phase,'waiting')
}))

test('stop during a blocked activity read cannot notify or wake the captain',()=>fixture(async f=>{
  f.provider.claim=async()=>{throw new Error('Missing claim prerequisite')}
  await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick()
  let release,entered;const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r)
  f.runtime.isRunning=async()=>{entered();return gate}
  const tick=f.controller.tick();await ready;const stop=f.controller.control('captain','stop');release(false)
  await Promise.all([tick,stop]);assert.equal(f.messages.filter(m=>m.id==='captain').length,0)
}))

test('captain guidance cannot interrupt a task already owned by controller verification',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0]
  await f.controller.report(task.sessionId,{phase:'review',ready:true})
  await assert.rejects(f.controller.message('captain',task.id,'Wait for older evidence','wait'),/verification/i)
  await f.controller.tick();assert.equal(task.status,'merged');assert.ok(task.closedAt)
}))

test('wait decisions for parked workers are recorded without sending another prompt',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0]
  await f.controller.report(task.sessionId,{phase:'blocked',blocked:true,note:'External prerequisite unchanged'})
  await f.controller.control('captain','stop');await f.controller.control('captain','resume')
  const q=await f.controller.question(task.sessionId,'Can execution resume?')
  await f.controller.message('captain',task.id,'Keep the execution hold','wait')
  await f.controller.answer('captain',q.id,'The prerequisite is still unavailable','wait');await f.controller.tick()
  assert.equal(f.messages.filter(m=>m.id===task.sessionId).length,0);assert.equal(task.status,'blocked');assert.ok(q.recordedAt);assert.ok(task.waitingDecision);assert.equal(task.resumeRequested,undefined);assert.equal(f.starts.length,1)
  await f.controller.control('captain','stop');await f.controller.control('captain','resume')
  await f.controller.message('captain',task.id,'Keep the execution hold','wait');await f.controller.tick()
  assert.equal(task.status,'blocked');assert.equal(f.starts.length,1)
  await f.controller.control('captain','stop');await f.controller.control('captain','resume')
  await f.controller.answer('captain',q.id,'The prerequisite is still unavailable','wait');await f.controller.tick()
  assert.equal(task.status,'blocked');assert.equal(f.starts.length,1)
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

test('operator announcements expose actual native admission failure instead of falsely acknowledging delivery',()=>fixture(async f=>{
  const run=await f.controller.start('captain',f.config)
  f.runtime.send=async()=>{throw new Error('Transport unavailable')}
  assert.equal(await f.controller.announce(run,'New host evidence'),false)
  f.runtime.send=async()=>{}
  assert.equal(await f.controller.announce(run,'New host evidence'),true)
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
test('closure failure cannot unlock its dependent in another milestone',()=>fixture(async f=>{
  f.setTickets([ticket('1'),ticket('2','M2',['1'])]);f.provider.close=async()=>{throw new Error('Temporary provider outage')}
  await f.controller.start('captain',{...f.config,parallelism:1});await f.controller.tick()
  const task=f.controller.state('captain').tasks[0]
  await f.controller.report(task.sessionId,{phase:'review',ready:true});await f.controller.tick();await f.controller.tick()
  assert.equal(task.status,'merged');assert.equal(task.closedAt,undefined);assert.equal(f.starts.length,1)
}))

test('free slots take independent later-milestone work while preserving milestone priority',()=>fixture(async f=>{
  f.setTickets([{...ticket('1','M1'),priority:9},{...ticket('2','M2'),priority:0},ticket('3','M2',['1'])])
  const run=await f.controller.start('captain',{...f.config,parallelism:2});await f.controller.tick()
  assert.deepEqual(run.tasks.map(t=>t.ticket.id),['1','2'])
  await f.controller.report(run.tasks[0].sessionId,{phase:'blocked',blocked:true,note:'External prerequisite'})
  await f.controller.tick();assert.equal(run.tasks.length,2)
}))

test('fresh dependency proof prevents a stale eligible ticket from claiming or starting a workspace',()=>fixture(async f=>{
  f.setTickets([ticket('1')]);let claims=0,prepares=0
  f.provider.claim=async()=>claims++;f.runtime.prepare=async()=>prepares++
  f.provider.verifyDependencies=async()=> 'Waiting for predecessor 2 to be merged and closed'
  const run=await f.controller.start('captain',f.config);await f.controller.tick()
  assert.equal(claims,0);assert.equal(prepares,0);assert.equal(f.starts.length,0)
  assert.equal(run.tasks[0].status,'blocked');assert.match(run.tasks[0].error,/predecessor 2/)
}))

test('a dependency added during review prevents PR creation without spending a code repair round',()=>fixture(async f=>{
  f.setTickets([ticket('1')]);let blocked=false,prs=0
  f.provider.verifyDependencies=async()=>blocked?'Waiting for predecessor 2':undefined
  f.provider.ensurePullRequest=async()=>{prs++;throw new Error('Must not create PR')}
  const run=await f.controller.start('captain',f.config);await f.controller.tick();const task=run.tasks[0]
  f.runtime.review=async()=>{blocked=true;return{passed:true,headSha:'head',findings:[],report:'pass'}}
  await f.controller.report(task.sessionId,{phase:'review',ready:true});await f.controller.tick()
  assert.equal(prs,0);assert.equal(task.status,'blocked');assert.equal(task.reviewRounds,0);assert.match(task.error,/predecessor 2/)
}))

test('fresh dependency failure just before merge blocks even a passing exact-head review',()=>fixture(async f=>{
  f.setTickets([ticket('1')]);let blocked=false
  f.provider.verifyDependencies=async()=>blocked?'Waiting for predecessor 2':undefined
  const inspect=f.provider.inspectPullRequest;f.provider.inspectPullRequest=async(...args)=>{const result=await inspect(...args);blocked=true;return result}
  const run=await f.controller.start('captain',f.config);await f.controller.tick();const task=run.tasks[0]
  await f.controller.report(task.sessionId,{phase:'review',ready:true});await f.controller.tick()
  assert.equal(f.merges.length,0);assert.equal(task.status,'blocked');assert.equal(task.reviewRounds,0)
}))

test('dependency verification outages hold ready work without archiving its team or requesting code repair',()=>fixture(async f=>{
  f.setTickets([ticket('1')]);const run=await f.controller.start('captain',f.config);await f.controller.tick();const task=run.tasks[0]
  const reasons=[];f.runtime.stop=async(_id,reason)=>reasons.push(reason)
  f.provider.verifyDependencies=async()=>{throw new Error('Dependency API unavailable')}
  await f.controller.report(task.sessionId,{phase:'review',ready:true});await f.controller.tick()
  assert.equal(task.status,'blocked');assert.equal(task.reviewRounds,0);assert.deepEqual(reasons,['shutdown'])
  assert.equal(f.messages.filter(m=>m.id===task.sessionId).length,0);assert.match(task.error,/Dependency API unavailable/)
}))

test('known dependent workers cannot resume until targeted proof clears their predecessor',()=>fixture(async f=>{
  f.setTickets([ticket('1')]);const run=await f.controller.start('captain',{...f.config,maxTickets:1,maxTaskMinutes:480});await f.controller.tick();const task=run.tasks[0]
  await f.controller.report(task.sessionId,{phase:'blocked',blocked:true,note:'Missing parent'});task.blockedSince=new Date(Date.now()-3601000).toISOString();await f.controller.tick()
  run.tickets=[ticket('1','M1',['2']),ticket('2')];let checks=0,blocked=true
  f.provider.verifyDependencies=async()=>{checks++;return blocked?'Waiting for predecessor 2':undefined}
  const starts=f.starts.length;await f.controller.resumeTask('captain',task.id,'solved',true)
  assert.equal(f.starts.length,starts);assert.equal(task.status,'blocked');assert.equal(checks,1)
  blocked=false;await f.controller.resumeTask('captain',task.id,'Parent delivered',true)
  assert.equal(f.starts.length,starts+1);assert.equal(task.dependencyBlocked,undefined)
}))

test('failed dependency quiescence cannot release its slot merely because the agent reports idle',()=>fixture(async f=>{
  f.setTickets([ticket('1')]);const run=await f.controller.start('captain',{...f.config,maxTickets:1,parallelism:1});await f.controller.tick();const task=run.tasks[0]
  f.provider.verifyDependencies=async()=> 'Waiting for predecessor 2'
  const stop=f.runtime.stop;f.runtime.stop=async()=>{throw new Error('Inbox drain not established')};f.runtime.isRunning=async()=>false
  try {
    await f.controller.report(task.sessionId,{phase:'review',ready:true});await f.controller.tick();await f.controller.tick()
    assert.equal(task.executionActive,true);assert.match(task.parkingError,/drain/)
    await assert.rejects(f.controller.resumeTask('captain',task.id,'solved',true),/quiesced/)
  }finally{f.runtime.stop=stop}
}))

test('a newly declared unmet predecessor holds an already-running worker before idle recovery',()=>fixture(async f=>{
  f.setTickets([ticket('1')]);const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0]
  f.setTickets([ticket('1','M1',['2']),ticket('2')]);f.provider.verifyDependencies=async()=> 'Waiting for predecessor 2'
  f.runtime.isRunning=async()=>false;task.lastWakeAt=new Date(Date.now()-61000).toISOString()
  const starts=f.starts.length;await f.controller.tick()
  assert.equal(task.status,'blocked');assert.equal(f.starts.length,starts);assert.equal(task.dependencyBlocked,true)
}))

test('live milestone scope updates preserve workers and immutable task contracts',()=>fixture(async f=>{
  f.setTickets([ticket('1'),ticket('2','M2')])
  const run=await f.controller.start('captain',{...f.config,milestones:['M1']});await f.controller.tick()
  const task=run.tasks[0],snapshot=JSON.stringify(task.assignmentConfig),starts=f.starts.length
  await f.controller.updateMilestones('captain',['M1','M2'])
  assert.equal(f.starts.length,starts);assert.equal(JSON.stringify(task.assignmentConfig),snapshot)
  await assert.rejects(f.controller.updateMilestones(task.sessionId,['M2']),/captain/i)
  await assert.rejects(f.controller.updateMilestones('captain',[]),/milestone/i)
  await f.controller.tick();assert.deepEqual(run.tasks.map(t=>t.ticket.id),['1','2'])
}))

test('milestone changes during a worker launch cannot admit tickets outside the new scope',()=>fixture(async f=>{
  f.setTickets([ticket('1'),ticket('2','M2')]);const run=await f.controller.start('captain',f.config)
  let release,entered;const started=new Promise(r=>entered=r),pending=new Promise(r=>release=r),originalStart=f.runtime.start
  f.runtime.start=async t=>{await originalStart(t);entered();await pending}
  const claims=[];f.provider.claim=async t=>claims.push(t.id)
  const tick=f.controller.tick();await started;await f.controller.updateMilestones('captain',['M1']);release();await tick
  assert.deepEqual(claims,['1']);assert.deepEqual(run.tasks.map(t=>t.ticket.id),['1'])
}))
test('cold restart restores existing workers without duplicate claims or sessions',()=>fixture(async f=>{
  await f.controller.start('captain',f.config);await f.controller.tick()
  const ids=f.controller.state('captain').tasks.map(t=>t.sessionId)
  await f.controller.dispose()
  const restored=[];f.runtime.restore=async task=>restored.push(task.sessionId)
  const next=new CaptainController(new RunStore(join(f.dir,'state')),f.runtime,()=>f.provider)
  try {await next.restore();await next.tick();assert.deepEqual(restored,ids);assert.equal(next.state('captain').tasks.length,2);assert.equal(f.starts.length,2)}finally{await next.dispose()}
}))

test('cold restore registers all prepared task workspaces even for completed and stopped runs without waking them',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:2});await f.controller.tick()
  await f.controller.report(run.tasks[0].sessionId,{phase:'review',ready:true});await f.controller.tick()
  await f.controller.control('captain','stop');await f.controller.dispose()
  const registered=[];f.runtime.registerWorkspace=async t=>{registered.push(t.sessionId);t.workspaceId=`workspace-${t.id}`}
  const next=new CaptainController(new RunStore(join(f.dir,'state')),f.runtime,()=>f.provider)
  try {await next.restore();assert.deepEqual(registered,run.tasks.map(t=>t.sessionId));assert.equal(f.starts.length,2);assert.equal(next.state('captain').tasks[0].status,'merged');assert.ok(next.state('captain').tasks.every(t=>t.workspaceId))}finally{await next.dispose()}
}))

test('missing historical worktrees preserve restored runs and stopped elapsed timestamps',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:2});await f.controller.tick()
  await f.controller.report(run.tasks[0].sessionId,{phase:'review',ready:true});await f.controller.tick()
  await f.controller.control('captain','stop');await f.controller.dispose()
  run.updatedAt='2026-01-01T12:00:00.000Z';await new RunStore(join(f.dir,'state')).save(run)
  f.runtime.registerWorkspace=async t=>{if(t.status==='merged')throw new Error('ENOENT: historical worktree removed');t.workspaceId='surviving-workspace'}
  const next=new CaptainController(new RunStore(join(f.dir,'state')),f.runtime,()=>f.provider)
  try {
    await next.restore();const restored=next.state('captain')
    assert.equal(restored.updatedAt,run.updatedAt);assert.match(restored.tasks[0].workspaceError,/ENOENT/)
    assert.equal(restored.tasks[0].status,'merged');assert.equal(restored.tasks[1].workspaceId,'surviving-workspace');assert.equal(f.starts.length,2)
    assert.equal((await new RunStore(join(f.dir,'state')).loadAll())[0].updatedAt,run.updatedAt)
  } finally {await next.dispose()}
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
test('dependency-held guidance and answers require fresh proof before waking a worker',()=>fixture(async f=>{
  f.setTickets([ticket('1')]);const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0]
  await f.controller.report(task.sessionId,{phase:'blocked',blocked:true,note:'Parent missing'});task.executionActive=false;task.dependencyBlocked=true
  let checks=0;f.provider.verifyDependencies=async()=>{checks++;return 'Waiting for predecessor 2'}
  await assert.rejects(f.controller.message('captain',task.id,'Continue implementation'),/dependenc/i)
  const q=await f.controller.question(task.sessionId,'Can I implement?')
  await f.controller.answer('captain',q.id,'Continue implementation')
  assert.equal(checks,2);assert.equal(f.messages.filter(m=>m.id===task.sessionId).length,0);assert.equal(task.status,'blocked');assert.ok(q.recordedAt);assert.equal(q.deliveredAt,undefined)
}))

test('pending dependency quiescence rejects resume and preserves late reports without losing cleanup failures',()=>fixture(async f=>{
  f.setTickets([ticket('1')]);const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0]
  f.provider.verifyDependencies=async()=> 'Waiting for predecessor 2'
  let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r),originalStop=f.runtime.stop
  f.runtime.stop=async()=>{entered();await gate;throw new Error('Native inbox drain failed')};f.runtime.isRunning=async()=>false
  await f.controller.report(task.sessionId,{phase:'review',ready:true});const tick=f.controller.tick();await started
  try {
    const resume=f.controller.resumeTask('captain',task.id,'solved',true);resume.catch(()=>{})
    let timeout;try {await assert.rejects(Promise.race([resume,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Resume overlapped pending cleanup')),100)})]),/quiesced/)}finally{clearTimeout(timeout)}
    await f.controller.report(task.sessionId,{phase:'review',ready:true,note:'Late ready report'})
    assert.equal(task.status,'blocked');assert.equal(task.executionActive,true)
  }finally{release();await tick;f.runtime.stop=originalStop}
  assert.match(task.parkingError,/Native inbox drain failed/);assert.equal(task.executionActive,true);assert.equal(f.starts.length,1)
}))
test('legacy pending answers without an action cannot wake dependency-held workers',()=>fixture(async f=>{
  f.setTickets([ticket('1')]);const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0]
  await f.controller.report(task.sessionId,{phase:'blocked',blocked:true,note:'Parent missing'});task.executionActive=false;task.dependencyBlocked=true
  const q=await f.controller.question(task.sessionId,'Legacy decision?');q.answer='Continue';q.answeredAt=new Date().toISOString()
  let checks=0;f.provider.verifyDependencies=async()=>{checks++;return 'Waiting for predecessor 2'}
  await f.controller.tick();assert.equal(checks,1);assert.equal(f.messages.filter(m=>m.id===task.sessionId).length,0);assert.equal(task.status,'blocked');assert.ok(q.recordedAt)
}))
test('a dependency hold persistence failure cannot enter the code repair wake lane',()=>fixture(async f=>{
  f.setTickets([ticket('1')]);const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0]
  f.provider.verifyDependencies=async()=> 'Waiting for predecessor 2'
  const stop=f.runtime.stop,save=f.controller.store.save.bind(f.controller.store);let failSave=false
  f.runtime.stop=async()=>{failSave=true;throw new Error('Child cleanup failed')}
  f.controller.store.save=async r=>{if(failSave){failSave=false;throw new Error('Transient persistence failure')};await save(r)}
  try {
    await f.controller.report(task.sessionId,{phase:'review',ready:true});await f.controller.tick()
    assert.equal(task.status,'blocked');assert.equal(task.reviewRounds,0);assert.equal(f.messages.filter(m=>m.id===task.sessionId).length,0);assert.match(task.parkingError,/cleanup failed/)
  }finally{f.runtime.stop=stop;f.controller.store.save=save}
}))
test('idle waiting workers enter the blocker clock without a timer-only wake and can park',()=>fixture(async f=>{
  f.setTickets([ticket('1')]);const run=await f.controller.start('captain',{...f.config,maxTickets:1,maxTaskMinutes:480});await f.controller.tick();const task=run.tasks[0]
  await f.controller.report(task.sessionId,{phase:'waiting',note:'CI member no longer executing; acceptance remains unmet'})
  f.runtime.isRunning=async()=>false;task.lastWakeAt=new Date(Date.now()-61000).toISOString()
  const starts=f.starts.length;await f.controller.tick()
  assert.equal(task.status,'blocked');assert.ok(task.blockedSince);assert.equal(f.starts.length,starts);assert.equal(f.messages.filter(m=>m.id===task.sessionId).length,0)
  const since=task.blockedSince;await f.controller.tick();assert.equal(task.blockedSince,since)
  task.blockedSince=new Date(Date.now()-3601000).toISOString();await f.controller.tick();assert.equal(task.status,'parked');assert.equal(task.executionActive,false)
}))

test('waiting roots retain capacity while owned members execute or activity cannot be established',()=>fixture(async f=>{
  f.setTickets([ticket('1')]);const run=await f.controller.start('captain',{...f.config,maxTickets:1,maxTaskMinutes:480});await f.controller.tick();const task=run.tasks[0]
  await f.controller.report(task.sessionId,{phase:'waiting',note:'Waiting on actual member work'});task.lastWakeAt=new Date(Date.now()-61000).toISOString()
  f.runtime.isRunning=async()=>true;await f.controller.tick();assert.equal(task.status,'running');assert.equal(task.blockedSince,undefined)
  f.runtime.isRunning=async()=>{throw new Error('Native activity unavailable')};await f.controller.tick();assert.equal(task.status,'running');assert.equal(task.blockedSince,undefined)
}))

test('a late implementation report cannot be overwritten by a stale idle-waiting observation',()=>fixture(async f=>{
  f.setTickets([ticket('1')]);const run=await f.controller.start('captain',{...f.config,maxTickets:1,maxTaskMinutes:480});await f.controller.tick();const task=run.tasks[0]
  await f.controller.report(task.sessionId,{phase:'waiting'});task.lastWakeAt=new Date(Date.now()-61000).toISOString()
  f.runtime.isRunning=async()=>{await f.controller.report(task.sessionId,{phase:'implementation',note:'Actual resumed work'});return false}
  await f.controller.tick();assert.equal(task.status,'running');assert.equal(task.phase,'implementation');assert.equal(task.blockedSince,undefined)
}))
test('an idle waiting hold after concrete guided resumption starts a fresh blocker observation',()=>fixture(async f=>{
  f.setTickets([ticket('1')]);const run=await f.controller.start('captain',{...f.config,maxTickets:1,maxTaskMinutes:480});await f.controller.tick();const task=run.tasks[0]
  await f.controller.report(task.sessionId,{phase:'blocked',blocked:true,note:'Original blocked episode'});task.blockedSince=new Date(Date.now()-3601000).toISOString()
  await f.controller.message('captain',task.id,'Concrete changed solution')
  await f.controller.report(task.sessionId,{phase:'waiting',note:'Changed solution has now yielded'})
  f.runtime.isRunning=async()=>false;task.lastWakeAt=new Date(Date.now()-61000).toISOString()
  const before=Date.now();await f.controller.tick();assert.equal(task.status,'blocked');assert.ok(Date.parse(task.blockedSince)>=before)
  await f.controller.tick();assert.equal(task.status,'blocked')
}))
test('unknown waiting-worker activity cannot stall independent ready delivery',()=>fixture(async f=>{
  f.setTickets([ticket('1'),ticket('2')]);const run=await f.controller.start('captain',{...f.config,maxTickets:2,maxTaskMinutes:480});await f.controller.tick();const [waiting,ready]=run.tasks
  await f.controller.report(waiting.sessionId,{phase:'waiting'});waiting.lastWakeAt=new Date(Date.now()-61000).toISOString()
  await f.controller.report(ready.sessionId,{phase:'review',ready:true})
  const isRunning=f.runtime.isRunning;f.runtime.isRunning=async id=>{if(id===waiting.sessionId)throw new Error('Native activity unavailable');return isRunning(id)}
  await f.controller.tick();assert.equal(waiting.status,'running');assert.equal(ready.status,'merged');assert.ok(ready.closedAt)
}))
test('live intake policy admits legitimate prerequisites and unmilestoned work with milestone priority',()=>fixture(async f=>{
 f.setTickets([ticket('426','M2',['401']),ticket('401',''),ticket('2','M1'),ticket('3','')])
 const run=await f.controller.start('captain',{...f.config,maxTickets:0,parallelism:4});await f.controller.tick();assert.deepEqual(run.tasks.map(t=>t.ticket.id),['2'])
 await f.controller.updatePolicy('captain',{includeUnmilestoned:true,includeRequiredPredecessors:true,ocrMaxTokensBudget:1000000})
 await f.controller.tick();assert.deepEqual(run.tasks.map(t=>t.ticket.id),['2','401','3']);assert.equal(run.tasks.some(t=>t.ticket.id==='426'),false)
}))

test('live review budget policy changes only that field in original assignment contracts',()=>fixture(async f=>{
 f.setTickets([ticket('1')]);const run=await f.controller.start('captain',{...f.config,maxTickets:1,ocrMaxTokensBudget:100000});await f.controller.tick();const task=run.tasks[0],snapshot={...task.assignmentConfig}
 await f.controller.updatePolicy('captain',{includeUnmilestoned:true,includeRequiredPredecessors:true,ocrMaxTokensBudget:1000000})
 assert.equal(task.assignmentConfig.ocrMaxTokensBudget,1000000);assert.deepEqual({...task.assignmentConfig,ocrMaxTokensBudget:snapshot.ocrMaxTokensBudget},snapshot)
 assert.match(task.phases.at(-1).note,/OCR.*session/);assert.equal(f.starts.length,1)
 await assert.rejects(f.controller.updatePolicy(task.sessionId,{ocrMaxTokensBudget:1000000}),/captain/)
 await assert.rejects(f.controller.updatePolicy('captain',{verifyCommands:['skip']}),/policy/)
 await f.controller.control('captain','stop');await assert.rejects(f.controller.updatePolicy('captain',{ocrMaxTokensBudget:1000000}),/active|policy/)
}))

test('narrowing live intake policy during launch cannot admit an unmilestoned ticket afterward',()=>fixture(async f=>{
 f.setTickets([ticket('1'),ticket('2','')]);const run=await f.controller.start('captain',{...f.config,includeUnmilestoned:true})
 let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r),start=f.runtime.start
 f.runtime.start=async(...args)=>{await start(...args);entered();await gate}
 const tick=f.controller.tick();await started;try{await f.controller.updatePolicy('captain',{includeUnmilestoned:false})}finally{release();await tick}
 assert.deepEqual(run.tasks.map(t=>t.ticket.id),['1'])
}))
test('paused policy changes notify the coordinator once after Resume without waking held workers',()=>fixture(async f=>{
 f.setTickets([ticket('1')]);const run=await f.controller.start('captain',{...f.config,maxTickets:1,ocrMaxTokensBudget:100000});await f.controller.tick();const task=run.tasks[0]
 await f.controller.control('captain','pause');await f.controller.updatePolicy('captain',{ocrMaxTokensBudget:1000000})
 assert.equal(f.messages.length,0);assert.ok(run.policyNotice);await f.controller.tick();assert.equal(f.messages.length,0)
 await f.controller.control('captain','resume');await f.controller.tick();assert.equal(f.messages.filter(m=>m.id==='captain').length,1);assert.equal(f.messages.filter(m=>m.id===task.sessionId).length,0);assert.ok(run.policyNotice.deliveredAt)
 await f.controller.tick();assert.equal(f.messages.filter(m=>m.id==='captain').length,1)
}))

test('stopped configuration updates the OCR ceiling without changing other saved assignment gates',()=>fixture(async f=>{
 f.setTickets([ticket('1')]);const run=await f.controller.start('captain',{...f.config,maxTickets:1,ocrMaxTokensBudget:100000});await f.controller.tick();const task=run.tasks[0],before={...task.assignmentConfig}
 await f.controller.control('captain','stop');await f.controller.configure('captain',{...run.config,ocrMaxTokensBudget:1000000})
 assert.equal(task.assignmentConfig.ocrMaxTokensBudget,1000000);assert.deepEqual({...task.assignmentConfig,ocrMaxTokensBudget:before.ocrMaxTokensBudget},before);assert.equal(task.status,'cancelled');assert.equal(f.messages.length,0)
}))
test('Pause during policy notification keeps it pending without a leader prompt',()=>fixture(async f=>{
 const run=await f.controller.start('captain',{...f.config,ocrMaxTokensBudget:100000})
 let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r)
 f.runtime.coordinatorLoop=async(_run,action)=>{if(action==='wake'){entered();await gate}}
 const policy=f.controller.updatePolicy('captain',{ocrMaxTokensBudget:1000000});await started
 await f.controller.control('captain','pause');release();await policy
 assert.equal(f.messages.length,0);assert.equal(run.policyNotice.deliveredAt,undefined);assert.equal(run.status,'paused')
}))

test('a superseded policy notification cannot arrive after the current policy',()=>fixture(async f=>{
 const run=await f.controller.start('captain',{...f.config,ocrMaxTokensBudget:100000})
 let entered,release,wakes=0;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r)
 f.runtime.coordinatorLoop=async(_run,action)=>{if(action==='wake'&&++wakes===1){entered();await gate}}
 const old=f.controller.updatePolicy('captain',{ocrMaxTokensBudget:200000});await started
 await f.controller.updatePolicy('captain',{ocrMaxTokensBudget:1000000});release();await old
 assert.equal(f.messages.length,1);assert.match(f.messages[0].text,/1000000/);assert.equal(run.config.ocrMaxTokensBudget,1000000);assert.ok(run.policyNotice.deliveredAt)
}))
test('owned idle recovery does not wait for a slow intake discovery',()=>fixture(async f=>{
 f.setTickets([ticket('1')]);const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0]
 f.runtime.isRunning=async()=>false;task.lastWakeAt=new Date(Date.now()-61000).toISOString()
 let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r)
 f.provider.discover=async()=>{entered();await gate;return[ticket('1')]}
 const tick=f.controller.tick();await started
 try{assert.equal(f.starts.length,2)}finally{release();await tick}
}))

test('idle waiting releases a confirmed idle slot for queued owned recovery before discovery',()=>fixture(async f=>{
 f.setTickets([ticket('1'),ticket('2')]);const run=await f.controller.start('captain',{...f.config,maxTickets:2});await f.controller.tick();const [waiting,retry]=run.tasks
 await f.controller.report(waiting.sessionId,{phase:'waiting'});await f.controller.report(retry.sessionId,{phase:'blocked',blocked:true,note:'Changed review budget'})
 run.config.parallelism=1;f.runtime.isRunning=async()=>false;waiting.lastWakeAt=new Date(Date.now()-61000).toISOString()
 await f.controller.resumeTask('captain',retry.id,'Owner raised review budget',true);assert.equal(retry.resumeRequested,true)
 let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r)
 f.provider.discover=async()=>{entered();await gate;return[ticket('1'),ticket('2')]}
 const tick=f.controller.tick();await started
 try{assert.equal(waiting.status,'blocked');assert.equal(retry.resumeRequested,undefined);assert.equal(f.starts.length,3)}finally{release();await tick}
}))
test('native activity arriving during dependency proof prevents an idle recovery checkpoint',()=>fixture(async f=>{
 f.setTickets([ticket('1')]);const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0]
 let pending=false;f.runtime.isRunning=async()=>pending;task.lastWakeAt=new Date(Date.now()-61000).toISOString()
 f.provider.verifyDependencies=async()=>{pending=true;return undefined}
 await f.controller.tick();assert.equal(f.starts.length,1);assert.equal(task.idleCheckpointAt,undefined)
}))
test('an unadmitted idle startup does not spend the single recovery checkpoint',()=>fixture(async f=>{
 f.setTickets([ticket('1')]);const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0]
 f.runtime.isRunning=async()=>false;task.lastWakeAt=new Date(Date.now()-61000).toISOString();f.runtime.start=async()=>false
 await f.controller.tick();assert.equal(task.idleCheckpointAt,undefined);assert.equal(task.recoveryAttempts,0)
}))
test('startup rejection rolls back an unadmitted idle checkpoint',()=>fixture(async f=>{
 f.setTickets([ticket('1')]);const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0]
 f.runtime.isRunning=async()=>false;task.lastWakeAt=new Date(Date.now()-61000).toISOString();f.runtime.start=async()=>{throw new Error('Native worker request was not admitted')}
 await f.controller.tick();assert.equal(task.idleCheckpointAt,undefined);assert.equal(task.recoveryAttempts,0)
}))
test('owned maintenance runs while a paused-started intake scan remains in flight',()=>fixture(async f=>{
 f.setTickets([ticket('1')]);const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0]
 await f.controller.report(task.sessionId,{phase:'waiting'});f.runtime.isRunning=async()=>false;task.lastWakeAt=new Date(Date.now()-61000).toISOString();await f.controller.control('captain','pause')
 let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r)
 f.provider.discover=async()=>{entered();await gate;return[ticket('1')]};const intake=f.controller.tick();await started
 try{await f.controller.control('captain','resume');await f.controller.recoverOwned();assert.equal(task.status,'blocked');assert.equal(f.starts.length,1)}finally{release();await intake}
}))

test('concurrent owned and intake maintenance share a single idle recovery operation',()=>fixture(async f=>{
 f.setTickets([ticket('1')]);const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0];task.lastWakeAt=new Date(Date.now()-61000).toISOString()
 let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);let first=true
 f.runtime.isRunning=async()=>{if(first){first=false;entered();await gate};return false}
 const intake=f.controller.tick();await started
 let owned;try{owned=f.controller.recoverOwned()}finally{release();await intake;if(owned)await owned}
 assert.equal(f.starts.length,2);assert.equal(task.recoveryAttempts,1)
}))

for(const action of ['stop','dispose'])test(`${action} cancels an in-flight owned dependency proof before awaiting recovery`,()=>fixture(async f=>{
 f.setTickets([ticket('1')]);const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0]
 f.runtime.isRunning=async()=>false;task.lastWakeAt=new Date(Date.now()-61000).toISOString()
 let entered,release,cancelled=0;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r)
 f.provider.verifyDependencies=async()=>{entered();await gate;throw new Error('Provider cancelled')}
 f.provider.cancel=()=>{cancelled++;release()}
 const recovery=f.controller.recoverOwned();await started
 const shutdown=action==='stop'?f.controller.control('captain','stop'):f.controller.dispose()
 try{await new Promise(r=>setImmediate(r));assert.equal(cancelled,1)}finally{release();await recovery;await shutdown}
 assert.equal(f.starts.length,1);assert.equal(task.idleCheckpointAt,undefined)
}))

test('owned maintenance restores a lost blocked activity reservation before claiming more work',()=>fixture(async f=>{
 f.setTickets([ticket('1'),ticket('2')]);const run=await f.controller.start('captain',{...f.config,parallelism:1,maxTickets:2});await f.controller.tick();const task=run.tasks[0]
 await f.controller.report(task.sessionId,{phase:'blocked',blocked:true,note:'OCR accounting pending'});task.executionActive=false
 await f.controller.recoverOwned();assert.equal(task.executionActive,true);await f.controller.tick();assert.equal(run.tasks.length,1)
 f.runtime.isRunning=async()=>false;await f.controller.recoverOwned();assert.equal(task.executionActive,false);await f.controller.tick();assert.equal(run.tasks.length,2)
}))

test('unknown owned job activity restores a conservative blocked reservation',()=>fixture(async f=>{
 f.setTickets([ticket('1')]);const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0]
 await f.controller.report(task.sessionId,{phase:'blocked',blocked:true});task.executionActive=false;f.runtime.isRunning=async()=>{throw new Error('Job registry unreadable')}
 await f.controller.recoverOwned();assert.equal(task.executionActive,true);assert.equal(f.starts.length,1)
}))

test('confirmed native activity corrects an automatic idle hold without a worker replay',()=>fixture(async f=>{
 f.setTickets([ticket('1')]);const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0]
 await f.controller.report(task.sessionId,{phase:'waiting'});f.runtime.isRunning=async()=>false;task.lastWakeAt=new Date(Date.now()-61000).toISOString();await f.controller.recoverOwned();assert.equal(task.status,'blocked')
 f.runtime.isRunning=async()=>true;await f.controller.recoverOwned();assert.equal(task.status,'running');assert.equal(task.phase,'waiting');assert.equal(task.blockedSince,undefined);assert.equal(f.starts.length,1)
}))

test('uncreated setup failures do not reserve slots as unknown job owners',()=>fixture(async f=>{
 f.setTickets([ticket('1'),ticket('2')]);const claim=f.provider.claim;f.provider.claim=async(t,...args)=>{if(t.id==='1')throw new Error('Claim failed');return claim(t,...args)}
 const run=await f.controller.start('captain',{...f.config,parallelism:1,maxTickets:2});await f.controller.tick();const first=run.tasks[0]
 f.runtime.isRunning=async(id)=>{if(id===first.sessionId)throw new Error('Session does not exist');return true}
 await f.controller.recoverOwned();assert.notEqual(first.executionActive,true);assert.equal(run.tasks.length,2)
}))

test('diagnosed blocked recovery queues before new intake without human budget reset',()=>fixture(async f=>{
 f.setTickets([ticket('1'),ticket('2'),ticket('3')]);const run=await f.controller.start('captain',{...f.config,maxTickets:3});await f.controller.tick();const [retry,other]=run.tasks
 await f.controller.report(retry.sessionId,{phase:'blocked',blocked:true,note:'Concrete repair pending'});retry.executionActive=false;run.config.parallelism=1
 let otherActive=true,diagnoses=0;f.runtime.isRunning=async id=>id===other.sessionId&&otherActive;f.runtime.assertCaptainDiagnostics=async()=>{diagnoses++}
 const budget=retry.budgetStartedAt,evidence='Completed original diagnosis: repair the owned invalidation regression'
 await f.controller.resumeTask('captain',retry.id,evidence);assert.equal(retry.resumeRequested,true);assert.equal(f.starts.length,2);assert.equal(retry.budgetStartedAt,budget);assert.equal(retry.pendingHumanRetry,undefined);assert.equal(diagnoses,1)
 const phases=retry.phases.length;await f.controller.resumeTask('captain',retry.id,evidence);assert.equal(retry.phases.length,phases);assert.equal(diagnoses,1)
 await f.controller.report(other.sessionId,{phase:'blocked',blocked:true,note:'External hold'});otherActive=false;await f.controller.tick()
 assert.equal(retry.status,'running');assert.equal(retry.resumeRequested,undefined);assert.equal(f.starts.length,3);assert.equal(run.tasks.length,2)
}))

test('autonomous blocked recovery requires completed diagnostics and known idle ownership',()=>fixture(async f=>{
 f.setTickets([ticket('1')]);const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0]
 await f.controller.report(task.sessionId,{phase:'blocked',blocked:true});f.runtime.isRunning=async()=>false
 f.runtime.assertCaptainDiagnostics=async()=>{throw new Error('Original diagnostic reports incomplete')}
 await assert.rejects(f.controller.resumeTask('captain',task.id,'Concrete new repair'),/diagnostic reports incomplete/);assert.equal(task.resumeRequested,undefined)
 f.runtime.assertCaptainDiagnostics=async()=>{};f.runtime.isRunning=async()=>{throw new Error('Job activity unreadable')}
 await assert.rejects(f.controller.resumeTask('captain',task.id,'Concrete new repair'),/Job activity unreadable/);assert.equal(task.resumeRequested,undefined)
 f.runtime.isRunning=async()=>true;await assert.rejects(f.controller.resumeTask('captain',task.id,'Concrete new repair'),/already executing/);assert.equal(f.starts.length,1)
}))

test('queued recovery checks newly declared dependencies even when cached scope was ready',()=>fixture(async f=>{
 f.setTickets([ticket('1')]);const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0]
 await f.controller.report(task.sessionId,{phase:'blocked',blocked:true});f.runtime.isRunning=async()=>false
 let checks=0;f.provider.verifyDependencies=async()=>{checks++;return 'New remote predecessor is not delivered'}
 await f.controller.resumeTask('captain',task.id,'Completed diagnosis: owned repair');assert.equal(checks,1);assert.equal(task.dependencyBlocked,true);assert.equal(f.starts.length,1)
}))

test('a slot freed by integration serves queued recovery before new root admission',()=>fixture(async f=>{
 f.setTickets([ticket('1'),ticket('2'),ticket('3')]);const run=await f.controller.start('captain',{...f.config,maxTickets:3});await f.controller.tick();const [retry,ready]=run.tasks
 await f.controller.report(retry.sessionId,{phase:'blocked',blocked:true});retry.executionActive=false;f.runtime.isRunning=async id=>id===ready.sessionId;run.config.parallelism=1
 await f.controller.resumeTask('captain',retry.id,'Completed diagnosis: owned repair');await f.controller.report(ready.sessionId,{phase:'review',ready:true});await f.controller.tick()
 assert.equal(ready.status,'merged');assert.equal(retry.status,'running');assert.equal(run.tasks.length,2);assert.deepEqual(f.starts,[retry.id,ready.id,retry.id])
}))

test('Stop cancels a queued recovery dependency proof before waiting for dispatch',()=>fixture(async f=>{
 f.setTickets([ticket('1')]);const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0]
 await f.controller.report(task.sessionId,{phase:'blocked',blocked:true});f.runtime.isRunning=async()=>false
 let entered,release,cancelled=0;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r)
 f.provider.verifyDependencies=async()=>{entered();await gate;throw new Error('Provider cancelled')};f.provider.cancel=()=>{cancelled++;release()}
 const retry=f.controller.resumeTask('captain',task.id,'Completed diagnosis: owned repair')
 // A gate is only reached once the fresh-proof requirement is implemented.
 await Promise.race([started,retry.then(()=>{throw new Error('Fresh proof was skipped')})])
 const stop=f.controller.control('captain','stop');try{await new Promise(r=>setImmediate(r));assert.equal(cancelled,1)}finally{release();await retry;await stop}
 assert.equal(f.starts.length,1)
}))

test('blocked phase alone records a durable hold and never becomes an idle retry',()=>fixture(async f=>{
 f.setTickets([ticket('1')]);const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0]
 await f.controller.report(task.sessionId,{phase:'blocked',note:'Configured CI failed; no safe work remains'});assert.equal(task.status,'blocked');assert.ok(task.blockedSince);const since=task.blockedSince
 f.runtime.isRunning=async()=>false;task.lastWakeAt=new Date(Date.now()-61000).toISOString();await f.controller.recoverOwned();await f.controller.report(task.sessionId,{phase:'blocked',note:'Configured CI failed; no safe work remains'})
 assert.equal(task.blockedSince,since);assert.equal(f.starts.length,1);assert.equal(f.messages.filter(m=>m.id==='captain').length,1)
 await assert.rejects(f.controller.report(task.sessionId,{phase:'blocked',ready:true}),/ready and blocked/);assert.equal(task.status,'blocked')
}))

test('legacy running blocked-phase records are normalized without replaying a worker',()=>fixture(async f=>{
 f.setTickets([ticket('1')]);const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0]
 task.phase='blocked';task.phases.push({phase:'blocked',at:new Date().toISOString(),note:'Explicit verification hold'});task.status='running';delete task.blockedSince
 f.runtime.isRunning=async()=>false;task.lastWakeAt=new Date(Date.now()-61000).toISOString();await f.controller.recoverOwned()
 assert.equal(task.status,'blocked');assert.equal(f.starts.length,1);assert.equal(task.idleCheckpointAt,undefined);assert.match(task.error,/Explicit verification hold/)
}))

test('new idle waiting observation replaces a stale pre-resumption blocker clock',()=>fixture(async f=>{
 f.setTickets([ticket('1')]);const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0]
 task.phase='waiting';task.status='running';task.blockedSince=new Date(Date.now()-3601000).toISOString();task.lastWakeAt=new Date(Date.now()-61000).toISOString();f.runtime.isRunning=async()=>false
 const observed=Date.now();await f.controller.recoverOwned();assert.equal(task.status,'blocked');assert.ok(Date.parse(task.blockedSince)>=observed);await f.controller.tick();assert.equal(task.status,'blocked')
}))

test('a diagnostic-deferred answer cannot abort independent ticket intake',()=>fixture(async f=>{
 f.setTickets([ticket('1')]);const run=await f.controller.start('captain',{...f.config,maxTickets:2});await f.controller.tick();const task=run.tasks[0],q=await f.controller.question(task.sessionId,'How should I repair this?')
 await f.controller.report(task.sessionId,{phase:'blocked',note:'Diagnosis pending'});f.runtime.isRunning=async()=>false;f.runtime.assertCaptainDiagnostics=async()=>{throw new Error('Original diagnostic team is still working')}
 await assert.rejects(f.controller.answer('captain',q.id,'Concrete recorded decision'),/diagnostic team is still working/)
 f.setTickets([ticket('1'),ticket('2')]);await f.controller.tick();assert.equal(run.tasks.length,2);assert.equal(f.starts.length,2);assert.equal(task.status,'blocked');assert.equal(q.deliveredAt,undefined);assert.match(q.deliveryError,/diagnostic team is still working/)
 f.runtime.assertCaptainDiagnostics=async()=>{};await f.controller.tick();assert.ok(q.deliveredAt);assert.equal(q.deliveryError,undefined);assert.equal(f.messages.filter(m=>m.id===task.sessionId).length,1)
}))

test('blocked answer guidance passes the exact ticket to scoped original diagnostics',()=>fixture(async f=>{
 f.setTickets([ticket('1')]);const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0],q=await f.controller.question(task.sessionId,'Bind the current source review?')
 await f.controller.report(task.sessionId,{phase:'blocked',note:'Fresh diagnostic decision needed'});f.runtime.isRunning=async()=>false
 let checked=0;f.runtime.assertCaptainDiagnostics=async(actualRun,actualTask)=>{assert.equal(actualRun,run);assert.equal(actualTask,task);checked++}
 await f.controller.answer('captain',q.id,'Use the completed exact-ticket original diagnosis')
 assert.equal(checked,1);assert.ok(q.deliveredAt);assert.equal(f.messages.filter(m=>m.id===task.sessionId).length,1)
}))

test('an immediate new block during admitted guidance starts a fresh diagnostic interval',()=>fixture(async f=>{
 f.setTickets([ticket('1')]);const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0]
 for(const mode of ['answer','message']){
  await f.controller.report(task.sessionId,{phase:'blocked',note:'Previous blocker'});task.blockedSince=new Date(Date.now()-3601000).toISOString();f.runtime.isRunning=async()=>false;f.runtime.assertCaptainDiagnostics=async()=>{}
  const send=f.runtime.send;let once=false;f.runtime.send=async(id,...args)=>{const result=await send(id,...args);if(id===task.sessionId&&!once){once=true;await f.controller.report(id,{phase:'blocked',note:`New blocker after ${mode}`})}return result}
  const started=Date.now()
  try{if(mode==='answer'){const q=await f.controller.question(task.sessionId,'Resume current work?');await f.controller.answer('captain',q.id,'Concrete remedy')}else await f.controller.message('captain',task.id,'Different concrete remedy')}
  finally{f.runtime.send=send}
  assert.equal(task.status,'blocked');assert.ok(Date.parse(task.blockedSince)>=started,`${mode} must not inherit the earlier blocked interval`)
 }
}))

test('admitted answer and message end the prior diagnostic interval before a silent idle hold',()=>fixture(async f=>{
 f.setTickets([ticket('1')]);const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0];f.runtime.assertCaptainDiagnostics=async()=>{};f.runtime.isRunning=async()=>false
 for(const mode of ['answer','message']){
  await f.controller.report(task.sessionId,{phase:'blocked',note:`Previous ${mode} block`});task.blockedSince=new Date(Date.now()-3601000).toISOString()
  if(mode==='answer'){const q=await f.controller.question(task.sessionId,'Resume now?');await f.controller.answer('captain',q.id,'Changed prerequisite')}else await f.controller.message('captain',task.id,'Another changed prerequisite')
  assert.equal(task.blockedSince,undefined)
  task.phase='waiting';task.lastWakeAt=new Date(Date.now()-61000).toISOString();const observed=Date.now();await f.controller.recoverOwned()
  assert.equal(task.status,'blocked');assert.ok(Date.parse(task.blockedSince)>=observed)
 }
}))

test('recording a diagnostic deferral must not hide persistence failure or admit more work',()=>fixture(async f=>{
 f.setTickets([ticket('1')]);const run=await f.controller.start('captain',{...f.config,maxTickets:2});await f.controller.tick();const task=run.tasks[0],q=await f.controller.question(task.sessionId,'Repair choice?')
 await f.controller.report(task.sessionId,{phase:'blocked',note:'Diagnosis pending'});f.runtime.isRunning=async()=>false;f.runtime.assertCaptainDiagnostics=async()=>{throw new Error('Diagnostic incomplete')};q.answer='Recorded decision';q.action='resume'
 const save=f.controller.store.save;f.controller.store.save=async()=>{throw new Error('Persistence unavailable')};f.setTickets([ticket('1'),ticket('2')])
 try{await assert.rejects(f.controller.tick(),/Persistence unavailable/);assert.equal(f.starts.length,1);assert.equal(q.deliveredAt,undefined)}finally{f.controller.store.save=save;f.controller.ticking=undefined /* The test already observed this rejected drain. */}
}))

test('existing-only mode keeps owned recovery running and prevents new tickets and follow-ups',()=>fixture(async f=>{
 f.setTickets([ticket('1')]);const run=await f.controller.start('captain',f.config);await f.controller.tick();const task=run.tasks[0],savedConfig=structuredClone(run.config)
 await f.controller.control('captain','drain');await f.controller.control('captain','finish-existing');assert.equal(run.status,'running');assert.equal(run.intakeMode,'existing-only')
 const revision=run.coordinatorRevision,notices=f.messages.length
 await f.controller.control('captain','finish-existing');assert.equal(run.coordinatorRevision,revision);assert.equal(f.messages.length,notices)
 f.setTickets([ticket('1'),ticket('2')]);await f.controller.tick();assert.equal(run.tasks.length,1)
 await f.controller.report(task.sessionId,{phase:'blocked',note:'Concrete repair'});f.runtime.isRunning=async()=>false;await f.controller.resumeTask('captain',task.id,'Completed diagnosis: owned repair');assert.equal(f.starts.length,2);assert.equal(run.tasks.length,1)
 await assert.rejects(f.controller.followup(task.sessionId,{title:'New issue',body:'Large unrelated follow-up',milestone:'M1',predecessors:[]}),/existing.only/i)
 await f.controller.control('captain','pause');await f.controller.control('captain','resume');assert.equal(run.intakeMode,'existing-only');assert.deepEqual(run.config,savedConfig)
 const persisted=(await f.controller.store.loadAll()).find(r=>r.id===run.id);assert.equal(persisted.intakeMode,'existing-only')
 await f.controller.control('captain','allow-new-tickets');await f.controller.tick();assert.equal(run.tasks.length,2)
}))

test('existing-only fence applies during discovery and preserves paused lifecycle and trial bounds',()=>fixture(async f=>{
 const run=await f.controller.start('captain',{...f.config,maxTickets:1});let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r)
 f.provider.discover=async()=>{entered();await gate;return[ticket('1'),ticket('2')]};const tick=f.controller.tick();await started
 try{await f.controller.control('captain','finish-existing')}finally{release();await tick}
 assert.equal(run.tasks.length,0);await f.controller.control('captain','pause');await f.controller.control('captain','allow-new-tickets');assert.equal(run.status,'paused')
 await f.controller.control('captain','resume');await f.controller.tick();assert.equal(run.tasks.length,1);assert.equal(run.config.maxTickets,1)
 await f.controller.control('captain','finish-existing');await f.controller.control('captain','allow-new-tickets');await f.controller.tick();assert.equal(run.tasks.length,1)
}))

test('existing-only control is coordinator-owned and does not freeze other repository runs',()=>fixture(async f=>{
 f.setTickets([ticket('1')]);const first=await f.controller.start('captain',f.config);await f.controller.tick()
 await assert.rejects(f.controller.control(first.tasks[0].sessionId,'finish-existing'),/captain/i)
 await f.controller.control('captain','finish-existing');const second=await f.controller.start('other',{...f.config,repository:'owner/other'});f.setTickets([ticket('1'),ticket('2')]);await f.controller.tick()
 assert.equal(first.tasks.length,1);assert.equal(second.tasks.length,2);assert.equal(second.intakeMode,undefined)
}))
test('parked threshold creates one recovery session, fences intake and preserves the ticket roster',()=>fixture(async f=>{
 f.setTickets(Array.from({length:8},(_,i)=>ticket(String(i+1))))
 const run=await f.controller.start('captain',{...f.config,parallelism:5,maxTaskMinutes:1440});await f.controller.tick()
 for(const t of run.tasks){t.status='parked';t.phase='parked';await f.runtime.stop(t.sessionId)}
 const ids=run.tasks.map(t=>t.id),claims=[];f.provider.claim=async t=>claims.push(t.id)
 await Promise.all([f.controller.tick(),f.controller.recoverOwned()])
 assert.equal(run.tasks.length,5);assert.deepEqual(run.tasks.map(t=>t.id),ids);assert.deepEqual(claims,[])
 assert.equal(run.backlogHold.parked,5);assert.equal(run.backlogHold.threshold,4)
 assert.equal(run.recoveryCampaign.task.kind,'recovery');assert.equal(f.starts.filter(id=>id===run.recoveryCampaign.task.id).length,1)
 const recoveryId=run.recoveryCampaign.task.sessionId
 await f.controller.tick();await f.controller.recoverOwned();assert.equal(run.recoveryCampaign.task.sessionId,recoveryId)
 assert.equal(f.starts.filter(id=>id===run.recoveryCampaign.task.id).length,1)
 const view=f.controller.view(recoveryId);assert.equal(view.coordinatorSessionId,'captain');assert.equal(view.recoveryScope.length,5)
 await assert.rejects(f.controller.control(recoveryId,'allow-new-tickets'),/captain/i)
 await assert.rejects(f.controller.followup(recoveryId,{title:'Extra',body:'Scope',milestone:'M1',predecessors:[]}),/recovery.*follow.up/i)
 await f.controller.control('captain','stop');assert.equal(await f.runtime.isRunning(recoveryId),false)
 assert.equal(run.recoveryCampaign.task.status,'cancelled')
}))

test('four parked tasks do not create a recovery workspace',()=>fixture(async f=>{
 f.setTickets(Array.from({length:4},(_,i)=>ticket(String(i+1))))
 const run=await f.controller.start('captain',{...f.config,parallelism:4,maxTaskMinutes:1440});await f.controller.tick()
 for(const t of run.tasks){t.status='parked';t.phase='parked';await f.runtime.stop(t.sessionId)}
 await f.controller.tick();assert.equal(run.recoveryCampaign,undefined);assert.equal(run.backlogHold,undefined)
}))

async function recoveryFixture(f){
 f.setTickets(Array.from({length:5},(_,i)=>ticket(String(i+1))))
 const run=await f.controller.start('captain',{...f.config,parallelism:5,maxTaskMinutes:1440,maxTickets:5})
 await f.controller.tick();for(const task of run.tasks){task.status='parked';task.phase='parked';await f.runtime.stop(task.sessionId)}
 return run
}
test('failed restore preflight never starts a recovery owner',()=>fixture(async f=>{
 const run=await recoveryFixture(f);run.recoveryPending=true;f.provider.preflight=async()=>{throw new Error('Provider unavailable')}
 const starts=f.starts.length;await f.controller.tick();assert.equal(f.starts.length,starts);assert.equal(run.recoveryCampaign,undefined)
}))
test('rejected recovery reports do not mutate release selection',()=>fixture(async f=>{
 const run=await recoveryFixture(f);await f.controller.tick();const root=run.recoveryCampaign.task
 await assert.rejects(f.controller.report(root.sessionId,{phase:'blocked',ready:true,affectedTaskIds:[run.tasks[0].id]}),/ready and blocked/)
 assert.deepEqual(run.recoveryCampaign.affectedTaskIds,[])
 await assert.rejects(f.controller.report(root.sessionId,{phase:'review',affectedTaskIds:['foreign']}),/existing task/)
 assert.deepEqual(run.recoveryCampaign.affectedTaskIds,[])
}))
test('Drain retains the lease while the recovery owner is working, then quiesces it',()=>fixture(async f=>{
 const run=await recoveryFixture(f);await f.controller.tick();const root=run.recoveryCampaign.task
 await f.controller.control('captain','drain');await f.controller.tick();assert.equal(run.status,'draining');assert.equal(await f.runtime.isRunning(root.sessionId),true)
 await f.runtime.stop(root.sessionId);await f.controller.tick();assert.equal(run.status,'stopped');assert.equal(root.status,'cancelled');assert.equal(await f.runtime.isRunning(root.sessionId),false)
}))
test('recovery startup retries retain one identity and Pause prevents late admission',()=>fixture(async f=>{
 const run=await recoveryFixture(f);const prepare=f.runtime.prepare;let release,entered
 const gate=new Promise(r=>release=r),began=new Promise(r=>entered=r)
 f.runtime.prepare=async t=>{if(t.kind==='recovery'){entered();await gate}await prepare(t)}
 const tick=f.controller.tick();await began;const root=run.recoveryCampaign.task,starts=f.starts.length
 await f.controller.control('captain','pause');release();await tick;assert.equal(f.starts.length,starts)
 await f.controller.control('captain','resume');await f.controller.recoverOwned();assert.equal(run.recoveryCampaign.task.id,root.id);assert.equal(f.starts.filter(id=>id===root.id).length,1)
}))
test('a verified shared merge releases only listed assignments and enforces target incorporation',()=>fixture(async f=>{
 const run=await recoveryFixture(f);await f.controller.control('captain','finish-existing');await f.controller.tick()
 const root=run.recoveryCampaign.task,affected=run.tasks[0],unaffected=run.tasks[1];await f.runtime.stop(root.sessionId)
 f.runtime.assertCaptainDiagnostics=async()=>{throw new Error('Main diagnostics still active')};f.runtime.assertRecoveryDiagnostics=async()=>{}
 await f.controller.report(root.sessionId,{phase:'review',ready:true,affectedTaskIds:[affected.id]});await f.controller.tick();await f.controller.recoveryGrades.get(run.id)
 assert.equal(root.status,'merged');assert.equal(affected.status,'running');assert.equal(affected.incorporateTargetSha,'merged');assert.equal(unaffected.status,'parked');assert.equal(run.tasks.length,5)
 const wakes=f.starts.length;await f.controller.recoverOwned();assert.equal(root.status,'merged');assert.equal(f.starts.length,wakes);assert.equal(run.backlogHold,undefined);assert.equal(run.intakeMode,'existing-only')
 f.runtime.containsTarget=async()=>false;await f.controller.report(affected.sessionId,{phase:'review',ready:true});await f.controller.tick();assert.equal(affected.status,'running');assert.ok(f.messages.some(m=>m.text.includes('Incorporate shared repair')));assert.equal(f.merges.filter(id=>id===affected.id).length,0)
 f.runtime.containsTarget=async()=>true;await f.controller.report(affected.sessionId,{phase:'review',ready:true});await f.controller.tick();assert.equal(affected.status,'merged')
}))
test('A future shared release instructions use each current review policy and merge only',()=>fixture(async f=>{
  const run=await recoveryFixture(f);await f.controller.tick();const repair=run.recoveryCampaign.task,affected=run.tasks[0]
  affected.assignmentConfig={...affected.assignmentConfig,reviewBackend:'agent',ocrAdditionalCheck:false,ocrMaxTokensBudget:5_000_000}
  await f.runtime.stop(repair.sessionId);await f.controller.report(repair.sessionId,{phase:'review',ready:true,affectedTaskIds:[affected.id]});await f.controller.tick();await f.controller.recoveryGrades.get(run.id)
  const text=run.recoveryReleases[0].note
  assert.match(text,/merge.*existing branch/i);assert.match(text,/no rebase/i);assert.match(text,/PRIMARY/);assert.match(text,/OWN 5000000/);assert.doesNotMatch(text,/rerun complete exact-head OCR\/CI/)
}))

test('an exact-head merged recovery is reconciled after lost acknowledgement without another review',()=>fixture(async f=>{
 const run=await recoveryFixture(f);await f.controller.tick();const root=run.recoveryCampaign.task;await f.runtime.stop(root.sessionId)
 root.status='ready';root.headSha='head';root.prUrl='https://example.com/pr';root.reviewHistory=[{passed:true,headSha:'head',at:new Date().toISOString(),findings:[],report:'manifest'}]
 f.runtime.review=async()=>{throw new Error('Unexpected duplicate review')};f.provider.inspectPullRequest=async()=>({id:'1',url:root.prUrl,headSha:'head',merged:true,mergeSha:'merged',checksPassed:true})
 await f.controller.tick();assert.equal(root.status,'merged');assert.equal(root.mergedSha,'merged');assert.equal(f.merges.length,0)
}))

test('a recovery release held by fresh dependencies remains pending and retries when proof changes',()=>fixture(async f=>{
 const run=await recoveryFixture(f);await f.controller.tick();const root=run.recoveryCampaign.task,affected=run.tasks[0];await f.runtime.stop(root.sessionId)
 f.provider.verifyDependencies=async()=> 'Waiting for actual predecessor';await f.controller.report(root.sessionId,{phase:'review',ready:true,affectedTaskIds:[affected.id]});await f.controller.tick();await f.controller.recoveryGrades.get(run.id)
 assert.equal(root.status,'merged');assert.equal(run.recoveryReleases[0].queuedAt,undefined);assert.equal(affected.resumeRequested,undefined)
 f.provider.verifyDependencies=async()=>undefined;await f.controller.recoverOwned();assert.equal(affected.status,'running');assert.ok(run.recoveryReleases[0].queuedAt)
 const starts=f.starts.length;await f.controller.recoverOwned();assert.equal(f.starts.length,starts)
}))
test('verified non-code recovery settles without a repository PR and does not reopen human intake',()=>fixture(async f=>{
 const run=await recoveryFixture(f);await f.controller.control('captain','finish-existing');await f.controller.tick();const root=run.recoveryCampaign.task;await f.runtime.stop(root.sessionId)
 f.runtime.assertRecoveryDiagnostics=async()=>{};f.runtime.recoveryHasChanges=async()=>false
 await f.controller.settleRecovery('captain','resolved','Completed original reports verified a supported environment repair',[run.tasks[0].id])
 assert.equal(run.recoveryCampaign.settlement.kind,'resolved');assert.equal(root.status,'parked');assert.equal(run.tasks[0].status,'running');assert.equal(f.merges.length,0);assert.equal(run.intakeMode,'existing-only');assert.equal(run.backlogHold,undefined)
 const starts=f.starts.length;await f.controller.tick();assert.equal(f.starts.length,starts)
}))
test('delivery failure quiesces the worker without archiving its repair team',()=>fixture(async f=>{
 const run=await f.controller.start('captain',f.config);await f.controller.tick();const task=run.tasks[0],reasons=[],stop=f.runtime.stop
 f.runtime.stop=async(id,reason)=>{reasons.push(reason);await stop(id,reason)};f.setPassing(false)
 await f.runtime.stop(task.sessionId,'shutdown');reasons.length=0;await f.controller.report(task.sessionId,{phase:'review',ready:true});await f.controller.tick()
 assert.ok(reasons.length);assert.ok(reasons.every(reason=>reason==='shutdown'),'A failed review must retain the SAME repair team')
 assert.notEqual(task.status,'merged')
}))
test('confirmed delivery archives only after the exact-head merge succeeds',()=>fixture(async f=>{
 const run=await f.controller.start('captain',f.config);await f.controller.tick();const task=run.tasks[0],events=[],stop=f.runtime.stop,merge=f.provider.merge
 f.runtime.stop=async(id,reason)=>{events.push(reason??'archive');await stop(id,reason)};f.provider.merge=async(...args)=>{events.push('merged');return merge(...args)}
 await f.runtime.stop(task.sessionId,'shutdown');events.length=0;await f.controller.report(task.sessionId,{phase:'review',ready:true});await f.controller.tick()
 assert.equal(task.status,'merged');assert.equal(events[0],'shutdown');assert.ok(events.indexOf('archive')>events.indexOf('merged'))
}))
test('a verified maintenance artifact never routes an unchanged recovery root into ticket review or PR delivery',()=>fixture(async f=>{
 const run=await recoveryFixture(f);await f.controller.tick();const root=run.recoveryCampaign.task,stop=f.runtime.stop,reasons=[]
 const handoff={worktree:root.worktree+'/artifacts/maintenance/darkingdoom',repository:'Ihab-Zhaika/dsh-delivery-captain',branch:'recovery/'+root.id.slice(0,8)+'-policy',headSha:'a'.repeat(40),treeSha:'b'.repeat(40),incorporated:false,loaded:false}
 f.runtime.recoveryMaintenance=async()=>handoff;f.runtime.assertRecoveryDiagnostics=async()=>{};f.runtime.review=async()=>{throw Error('Wrong repository review must not run')};f.runtime.stop=async(id,reason)=>{reasons.push(reason);await stop(id,reason)}
 await f.controller.report(root.sessionId,{phase:'review',ready:true});await f.controller.recoverOwned();await f.controller.recoveryGrades.get(run.id)
 assert.equal(root.status,'blocked');assert.match(root.error,/maintainer/i);assert.deepEqual(root.maintenanceHandoff,handoff);assert.equal(root.reviewRounds,0);assert.equal(f.merges.length,0);assert.ok(reasons.every(r=>r==='shutdown'))
 const messages=f.messages.length;await f.controller.recoverOwned();assert.equal(f.messages.length,messages,'Unchanged maintenance handoffs do not wake the archived owner')
}))
test('a delayed recovery artifact failure cannot overwrite a later explicit worker hold',()=>fixture(async f=>{
 const run=await recoveryFixture(f);await f.controller.tick();const root=run.recoveryCampaign.task;let enter,reject;const entered=new Promise(r=>enter=r),gate=new Promise((_r,j)=>reject=j)
 f.runtime.recoveryMaintenance=async()=>{enter();return gate};await f.controller.report(root.sessionId,{phase:'review',ready:true});await f.controller.recoverOwned();await entered
 await f.controller.report(root.sessionId,{phase:'blocked',note:'Later hold owns this transition'});reject(Error('Stale inspection failed'));await f.controller.recoveryGrades.get(run.id)
 assert.equal(root.error,'Later hold owns this transition');assert.equal(root.phase,'blocked')
}))
test('failed archival after a confirmed merge preserves delivery and records cleanup separately',()=>fixture(async f=>{
 const run=await f.controller.start('captain',f.config);await f.controller.tick();const task=run.tasks[0],stop=f.runtime.stop
 f.runtime.stop=async(id,reason)=>{if(reason===undefined)throw Error('Archive unavailable');await stop(id,reason)}
 await f.runtime.stop(task.sessionId,'shutdown');await f.controller.report(task.sessionId,{phase:'review',ready:true});await f.controller.tick()
 assert.equal(task.status,'merged');assert.match(task.error,/Merged; team cleanup pending/);assert.equal(task.reviewRounds,0)
}))
test('maintenance observation is coordinator-owned, idempotent and preserves existing holds until actual load proof',()=>fixture(async f=>{
 const run=await recoveryFixture(f);await f.controller.control('captain','finish-existing');await f.controller.tick();const root=run.recoveryCampaign.task;await f.runtime.stop(root.sessionId,'shutdown');await f.controller.report(root.sessionId,{phase:'blocked',note:'Retained original hold'})
 const record={worktree:root.worktree+'/artifacts/maintenance/darkingdoom',repository:'owner/plugin',branch:'recovery/'+root.id.slice(0,8)+'-policy',baseSha:'c'.repeat(40),headSha:'a'.repeat(40),treeSha:'b'.repeat(40),incorporated:true,loaded:false}
 f.runtime.recoveryMaintenance=async()=>structuredClone(record);f.runtime.assertRecoveryDiagnostics=async()=>{};f.runtime.recoveryHasChanges=async()=>!record.loaded
 await assert.rejects(f.controller.observeMaintenanceHandoff(root.sessionId),/captain/)
 await assert.rejects(f.controller.settleRecovery('captain','resolved','Actual plugin code changed',[]),/Observe/)
 await f.controller.observeMaintenanceHandoff('captain');assert.equal(root.error,'Retained original hold');assert.equal(root.status,'blocked');const count=root.phases.length;await f.controller.observeMaintenanceHandoff('captain');assert.equal(root.phases.length,count)
 await assert.rejects(f.controller.settleRecovery('captain','resolved','Not yet loaded',[]),/gated PR/);record.loaded=true;await f.controller.settleRecovery('captain','resolved','Existing maintainer reviewed, integrated and loaded the actual plugin repair',[])
 assert.equal(root.status,'parked');assert.equal(root.error,undefined);assert.equal(root.maintenanceHandoff.loaded,true);assert.equal(f.merges.length,0);assert.equal(run.intakeMode,'existing-only')
}))
test('a later pause during the final maintenance activity check revokes the pending observation',()=>fixture(async f=>{
 const run=await recoveryFixture(f);await f.controller.tick();const root=run.recoveryCampaign.task;await f.runtime.stop(root.sessionId,'shutdown')
 f.runtime.assertRecoveryDiagnostics=async()=>{};f.runtime.recoveryMaintenance=async()=>({headSha:'a'.repeat(40),treeSha:'b'.repeat(40)})
 let entered,release;const began=new Promise(r=>entered=r),gate=new Promise(r=>release=r),running=f.runtime.isRunning
 f.runtime.isRunning=async id=>{if(id===root.sessionId){entered();await gate;return false}return running(id)}
 const pending=f.controller.observeMaintenanceHandoff('captain');await began;await f.controller.control('captain','pause');release()
 await assert.rejects(pending,/changed/);assert.equal(root.maintenanceHandoff,undefined)
}))
test('a prospective maintenance primary review is coordinator-only, single-flight, tuple-specific and leaves tickets unchanged',()=>fixture(async f=>{
 f.config.reviewBackend='agent';const run=await recoveryFixture(f);await f.controller.control('captain','finish-existing');await f.controller.tick();const root=run.recoveryCampaign.task;root.maintenanceHandoff={headSha:'a'.repeat(40)}
 const base='b'.repeat(40),head='c'.repeat(40);let release,enter,calls=0;const gate=new Promise(r=>release=r),entered=new Promise(r=>enter=r),ids=run.tasks.map(t=>t.id)
 f.runtime.reviewMaintenance=async(_run,b,h)=>{calls++;assert.equal(b,base);assert.equal(h,head);enter();await gate;return{passed:true,baseSha:base,headSha:head,treeSha:'d'.repeat(40),report:'Authentic fixture receipt',findings:[],backend:'agent',reviewerSessionId:'fixture-native-child'}}
 await assert.rejects(f.controller.reviewMaintenance(root.sessionId,base,head),/captain/)
 const pending=f.controller.reviewMaintenance('captain',base,head);await entered;await assert.rejects(f.controller.reviewMaintenance('captain',base,head),/running/);release();const result=await pending
 assert.equal(result.result.passed,true);assert.equal(calls,1);assert.deepEqual(run.tasks.map(t=>t.id),ids);assert.equal(f.merges.length,0);assert.equal(run.intakeMode,'existing-only');assert.equal(f.controller.view(run.tasks[0].sessionId).run.maintenanceReviewHistory,undefined)
 const old=await f.controller.reviewMaintenance('captain',base,head);assert.equal(calls,1,'Same exact tuple/policy receipt must not launch a timer replay');assert.equal(old.result.passed,false,'Historical receipt cannot be silently adopted as current')
}))
test('a maintenance primary result revoked by a later pause remains nonpassing history',()=>fixture(async f=>{
 f.config.reviewBackend='agent';const run=await recoveryFixture(f);await f.controller.tick();run.recoveryCampaign.task.maintenanceHandoff={headSha:'a'.repeat(40)};let release,enter;const gate=new Promise(r=>release=r),entered=new Promise(r=>enter=r)
 f.runtime.reviewMaintenance=async()=>{enter();await gate;return{passed:true,baseSha:'b'.repeat(40),headSha:'c'.repeat(40),report:'Native structured receipt',findings:[],backend:'agent'}}
 const pending=f.controller.reviewMaintenance('captain','b'.repeat(40),'c'.repeat(40));await entered;await f.controller.control('captain','pause');release();const result=await pending
 assert.equal(result.result.passed,false);assert.match(result.result.findings.join(' '),/changed/);assert.equal(run.status,'paused');assert.equal(f.merges.length,0)
}))
for(const action of ['stop','dispose'])test(`maintenance review under a terminal archived owner cancels and settles during ${action}`,()=>fixture(async f=>{
 f.config.reviewBackend='agent';const run=await recoveryFixture(f);await f.controller.tick();const root=run.recoveryCampaign.task;root.status='failed';root.maintenanceHandoff={headSha:'a'.repeat(40)};let enter,cancel,called=false;const began=new Promise(r=>enter=r),gate=new Promise(r=>cancel=r)
 f.runtime.reviewMaintenance=async()=>{enter();await gate;return{passed:false,baseSha:'b'.repeat(40),headSha:'c'.repeat(40),report:'Owned native review cancelled',findings:['cancelled'],backend:'agent'}}
 f.runtime.cancelMaintenanceReview=id=>{assert.equal(id,run.id);called=true;cancel()}
 const pending=f.controller.reviewMaintenance('captain','b'.repeat(40),'c'.repeat(40));await began
 const closing=action==='stop'?f.controller.control('captain','stop'):f.controller.dispose();await new Promise(r=>setTimeout(r,20));try{assert.equal(called,true,'Terminal task filtering must not skip paid review ownership')}finally{cancel()}
 await closing;assert.equal((await pending).result.passed,false)
}))
test('external settlement cannot release workers and dirty recovery code cannot bypass PR gates',()=>fixture(async f=>{
 const run=await recoveryFixture(f);await f.controller.tick();const root=run.recoveryCampaign.task;await f.runtime.stop(root.sessionId)
 f.runtime.assertRecoveryDiagnostics=async()=>{};f.runtime.recoveryHasChanges=async()=>true
 await assert.rejects(f.controller.settleRecovery('captain','resolved','Source changed but not reviewed',[run.tasks[0].id]),/gated PR/)
 f.runtime.recoveryHasChanges=async()=>false
 await assert.rejects(f.controller.settleRecovery('captain','external','Genuine physical device prerequisite unchanged',[run.tasks[0].id]),/cannot release/)
 await f.controller.settleRecovery('captain','external','Genuine physical device prerequisites remain unavailable',[])
 assert.ok(run.backlogHold);assert.equal(run.recoveryReleases,undefined);const starts=f.starts.length;await f.controller.tick();assert.equal(f.starts.length,starts)
}))

test('three consecutive scheduler failures trigger a recovery owner even below the parked threshold',()=>fixture(async f=>{
 const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();f.provider.discover=async()=>{throw new Error('Runtime transport defect')}
 for(let i=0;i<3;i++)await f.controller.tick()
 assert.equal(run.schedulerFailures.count,3);assert.equal(run.recoveryCampaign,undefined)
 await f.controller.recoverOwned();assert.equal(run.recoveryCampaign.task.kind,'recovery');assert.match(run.backlogHold.reason,/consecutive scheduler failures/);assert.equal(run.tasks.length,1)
}))
test('an independent recovery review cannot block existing owned maintenance',()=>fixture(async f=>{
 const run=await recoveryFixture(f);await f.controller.tick();const root=run.recoveryCampaign.task;await f.runtime.stop(root.sessionId)
 let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r)
 f.runtime.review=async t=>{if(t.kind==='recovery'){entered();await gate}return {passed:true,headSha:'head',findings:[],report:'report'}}
 await f.controller.report(root.sessionId,{phase:'review',ready:true});await f.controller.tick();await started
 await f.controller.recoverOwned();assert.equal(run.recoveryCampaign.task.status,'ready');assert.equal(run.tasks.length,5)
 release();await f.controller.recoveryGrades.get(run.id)
}))

test('a later explicit WAIT revokes an older pending shared-recovery intent',()=>fixture(async f=>{
 const run=await recoveryFixture(f);await f.controller.tick();const root=run.recoveryCampaign.task,affected=run.tasks[0];await f.runtime.stop(root.sessionId)
 f.provider.verifyDependencies=async()=> 'Actual predecessor still open';await f.controller.report(root.sessionId,{phase:'review',ready:true,affectedTaskIds:[affected.id]});await f.controller.tick();await f.controller.recoveryGrades.get(run.id)
 assert.equal(run.recoveryReleases[0].queuedAt,undefined)
 await f.controller.message('captain',affected.id,'A later device prerequisite remains unavailable','wait');const starts=f.starts.length
 f.provider.verifyDependencies=async()=>undefined;await f.controller.recoverOwned()
 assert.ok(run.recoveryReleases[0].revokedAt);assert.equal(f.starts.length,starts);assert.equal(affected.waitingDecision,'A later device prerequisite remains unavailable')
}))
test('settlement rejects owned activity arriving during asynchronous validation',()=>fixture(async f=>{
 const run=await recoveryFixture(f);await f.controller.tick();const root=run.recoveryCampaign.task;await f.runtime.stop(root.sessionId)
 f.runtime.assertRecoveryDiagnostics=async()=>{};f.runtime.recoveryHasChanges=async()=>{await f.runtime.start(root,run);return false}
 await assert.rejects(f.controller.settleRecovery('captain','external','Verified external acceptance still unavailable',[]),/activity changed/)
 assert.equal(run.recoveryCampaign.settlement,undefined);assert.notEqual(root.status,'parked')
}))
test('a settled campaign stays quiet when unrelated existing work lowers the parked count',()=>fixture(async f=>{
 const run=await recoveryFixture(f);await f.controller.tick();const root=run.recoveryCampaign.task;await f.runtime.stop(root.sessionId)
 f.runtime.assertRecoveryDiagnostics=async()=>{};f.runtime.recoveryHasChanges=async()=>false
 await f.controller.settleRecovery('captain','resolved','Completed original diagnostics verified a normal environment repair',[run.tasks[0].id])
 run.tasks[1].status='running';const starts=f.starts.length;await f.controller.recoverOwned()
 assert.equal(run.tasks.filter(t=>t.status==='parked').length,3);assert.equal(f.starts.length,starts);assert.equal(root.status,'parked');assert.ok(run.recoveryCampaign.settlement)
}))

test('explicit review backend policy updates existing assignments without waking workers or weakening CI',()=>fixture(async f=>{
 const run=await f.controller.start('captain',{...f.config,reviewBackend:'ocr'});await f.controller.tick();const task=run.tasks[0],before=f.starts.length,commands=[...task.assignmentConfig.verifyCommands]
 await f.controller.updatePolicy('captain',{reviewBackend:'agent',ocrAdditionalCheck:false})
 assert.equal(run.config.reviewBackend,'agent');assert.equal(task.assignmentConfig.reviewBackend,'agent');assert.deepEqual(task.assignmentConfig.verifyCommands,commands);assert.equal(f.starts.length,before);assert.match(run.policyNotice.text,/PRIMARY review/)
}))
test('review policy changes during verification invalidate the old result before merge',()=>fixture(async f=>{
 const run=await f.controller.start('captain',{...f.config,maxTickets:1,reviewBackend:'ocr'});await f.controller.tick();const task=run.tasks[0]
 let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r)
 f.runtime.review=async()=>{entered();await gate;return {passed:true,headSha:'head',baseSha:'base',findings:[],report:'old OCR pass',backend:'ocr'}}
 await f.controller.report(task.sessionId,{phase:'review',ready:true});const tick=f.controller.tick();await started
 await f.controller.updatePolicy('captain',{reviewBackend:'agent',ocrAdditionalCheck:false});release();await tick
 assert.equal(f.merges.length,0);assert.ok(f.messages.some(m=>m.text.includes('policy changed')));assert.equal(task.reviewHistory.at(-1).backend,'ocr')
}))

test('unrelated legacy configuration updates preserve implicit OCR review',()=>fixture(async f=>{
 const run=await f.controller.start('captain',{...f.config,reviewBackend:'ocr'});delete run.config.reviewBackend
 await f.controller.control('captain','parallelism',3);assert.equal(run.config.reviewBackend,'ocr')
 delete run.config.reviewBackend;await f.controller.updateMilestones('captain',['M1']);assert.equal(run.config.reviewBackend,'ocr')
}))
test('a later WAIT during release persistence cannot be adopted as the old intent baseline',()=>fixture(async f=>{
 const run=await recoveryFixture(f);await f.controller.tick();const root=run.recoveryCampaign.task,affected=run.tasks[0];await f.runtime.stop(root.sessionId)
 f.provider.verifyDependencies=async()=> 'Predecessor still open';await f.controller.report(root.sessionId,{phase:'review',ready:true,affectedTaskIds:[affected.id]});await f.controller.tick();await f.controller.recoveryGrades.get(run.id)
 f.provider.verifyDependencies=async()=>undefined;const save=f.controller.store.save.bind(f.controller.store);let entered,release,once=false
 const began=new Promise(r=>entered=r),gate=new Promise(r=>release=r)
 f.controller.store.save=async state=>{if(!once&&state.recoveryReleases?.length){once=true;entered();await gate}await save(state)}
 const pending=f.controller.recoverOwned();await began;await f.controller.message('captain',affected.id,'Fresh human device hold must remain','wait');const starts=f.starts.length;release();await pending
 assert.equal(f.starts.length,starts);assert.equal(affected.waitingDecision,'Fresh human device hold must remain');assert.equal(run.recoveryReleases[0].queuedAt,undefined)
}))
