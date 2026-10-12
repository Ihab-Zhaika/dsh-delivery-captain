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
  assert.equal(task.executionActive,true);f.provider.discover=async()=>{throw new Error('Offline')}
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

test('waiting for reports does not resend assignments to an idle parent',()=>fixture(async f=>{
  const run=await f.controller.start('captain',{...f.config,maxTickets:1});await f.controller.tick();const task=run.tasks[0]
  await f.controller.report(task.sessionId,{phase:'waiting',note:'Original members are working; waiting for their reports'})
  f.runtime.isRunning=async()=>false;task.lastWakeAt='2000-01-01'
  await f.controller.tick();await f.controller.tick();assert.equal(f.starts.length,1);assert.equal(task.phase,'waiting')
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
