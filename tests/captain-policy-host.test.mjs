import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, createUserMessage, isAgentLoopRequest } from '@deepseek-ai/dsh-llm'
import { applyChildComposition, snapshotSubagentDescriptor } from '@deepseek-ai/dsh-subagent'
import * as runtime from '../src/captain/runtime.ts'

const requireDsh=createRequire(import.meta.resolve('@deepseek-ai/dsh/package.json'))
const requireBase=createRequire(requireDsh.resolve('@deepseek-ai/dsh-base/package.json'))
const loadModule=async name=>import(pathToFileURL(requireBase.resolve('@deepseek-ai/dsh-'+name)).href)
const model={provider:'local-policy-test',id:'fixture',name:'Fixture',context:{contextWindow:262144},defaultMaxTokens:8192}
const chunks=[{type:'block-start',index:0,blockType:'text'},{type:'text-delta',index:0,text:'done'},{type:'block-end',index:0,block:{type:'text',text:'done'}},{type:'usage',usage:{inputTokens:10,outputTokens:1}},{type:'finish',reason:{kind:'stop'}}]
const frozenPersona='You are reviewer. MANDATORY independent OCR --max-tokens-budget 1000000. Preserve role, source scope and original attempts.'
async function fixture(t,{complete=false,persistence=false}={}){
  const dir=await mkdtemp(join(tmpdir(),'captain-policy-host-')),host=new Context(),fibers=[],handles=[],requests=[],errors=[],journal=[]
  t.after(async()=>{for(const handle of handles.reverse())await handle.dispose();for(const fiber of fibers.reverse())await fiber.dispose();await rm(dir,{recursive:true,force:true})})
  async function mount(name,config){const m=await loadModule(name),fiber=host.plugin(m.default,config);fibers.push(fiber);await fiber.await()}
  await mount('session');await mount('session-projection');await mount('agent');await mount('llm',{});await mount('system-prompt',{includeHarnessIdentity:false});await mount('tools',{mode:'native'});if(persistence)await mount('session-persistence-jsonl',{root:join(dir,'private-sessions'),compression:'none'});await mount('agent-loop',{agents:[],maxParallelToolCalls:1})
  host.on('agent/error',payload=>errors.push(String(payload.error)))
  host.on('session/event',(session,event)=>journal.push({id:session.id,event}))
  let prepareHook
  class Adapter extends LlmAdapter{
    async listModels(){return[model]}
    async resolveModel(provider,id){if(prepareHook)await prepareHook();return{...model,provider,id}}
    async *stream(options){requests.push({json:JSON.stringify(options),marked:isAgentLoopRequest(options),frozen:Object.isFrozen(options),session:options.sessionId});yield*chunks}
  }
  host.llm.registerAdapter(['local-policy-test'],new Adapter())
  host.tools.register({name:'read',description:'Read-only synthetic fixture tool',parameters:{},output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},async execute(){return'fixture'}})
  const rootHandle=await host.agents.create({sessionId:'policy-root',meta:{cwd:dir},agentOptions:{provider:model.provider,model:model.id}});handles.push(rootHandle)
  const root=rootHandle.agent,at=Date.now()
  const config={provider:'github',repository:'test/repo',workspace:dir,milestones:['M1'],remote:'origin',targetBranch:'main',parallelism:1,maxTeamMembers:2,pollSeconds:30,maxTickets:0,maxRepairRounds:3,maxTaskMinutes:480,verifyCommands:['node --version'],workerPreset:'standard',requireBrowser:false,requireMemory:false,reviewBackend:'agent',ocrAdditionalCheck:false,ocrMaxTokensBudget:5_000_000}
  const task={id:'delivery-task',attempt:'delivery-attempt',sessionId:root.id,branch:'test',worktree:dir,baseSha:'a'.repeat(40),status:'running',phase:'analysis',phases:[],startedAt:new Date().toISOString(),reviewRounds:0,followups:[],assignmentConfig:config,ticket:{id:'1',title:'Test',body:'Test',url:'',milestone:'',predecessors:[],state:'open',merged:false,priority:1,createdAt:'',labels:[]}}
  const run={id:'policy-run',captainSessionId:'coordinator',config,status:'running',coordinatorRevision:1,tasks:[task],tickets:[task.ticket],questions:[],createdAt:'',updatedAt:''}
  root.session.append('tool/call',{callId:'create-team',name:'agent_teams_create',arguments:JSON.stringify({name:'policy-team',approval:'automatic',description:'Delivery task delivery-task'})})
  const callSeq=root.session.seq-1
  root.session.append('tool/result',{message:{id:'create-result',role:'tool',toolCallId:'create-team',source:{kind:'tool',callId:'create-team'},isError:false,content:[]},meta:{team_id:'policy-team',team_name:'policy-team',captain_session_id:root.id}},{surfaceOp:'append',sourceEventSeqs:[callSeq]})
  const team={id:'policy-team',name:'policy-team',captainSessionId:root.id,description:'Delivery task delivery-task',createdAt:at,taskSeq:1,phase:'running',members:[{id:'policy-child',name:'reviewer',role:'independent reviewer',joinedAt:at,status:'idle'}],tasks:[{id:'t1',subject:'Review',assignee:'reviewer',status:'in_progress',attempt:1,attemptId:'member-attempt',dependencies:[],createdAt:at,updatedAt:at}]}
  const teamFile=join(dir,'.agent-teams','policy-team','team.json');await mkdir(join(dir,'.agent-teams','policy-team'),{recursive:true});await writeFile(teamFile,JSON.stringify(team))
  let catalog=[{id:'policy-child',mode:'continuable',label:'agent-teams:policy-team:reviewer',createdAt:at}]
  host.provide('subagents',{listChildren:async()=>catalog,listDescendants:async()=>catalog.map(row=>({kind:'child',...row,parentId:root.id,depth:1,activity:'inactive',hasChildren:false}))})
  let inheritedReceipt=false
  host.provide('sessionController',{inspect:async id=>{const agent=host.agents.get(id);return{meta:agent.session.header,inheritedEventCount:inheritedReceipt?agent.session.seq:agent.session.inheritedEventCount,events:agent.session.snapshotEvents()}}})
  // Baseline has no installer: exercise its real unchanged host behavior rather than counting missing exports as causal policy RED.
  let policyEnabled=true
  const install=ctx=>{if(policyEnabled)runtime.installDeliveryPolicy?.(ctx,()=>[run])}
  let policyFiber=host.plugin({inject:['agents','systemPrompt','subagents','sessionController'],apply(ctx){install(ctx)}});fibers.push(policyFiber);await policyFiber.await()
  const descriptor=snapshotSubagentDescriptor({mode:'continuable',provider:'spawn',label:'agent-teams:policy-team:reviewer',persona:frozenPersona,toolFilter:{allow:['read']},agentProvider:model.provider,agentModel:model.id})
  const childHandle=await host.agents.create({sessionId:'policy-child',parentAgent:root,meta:{cwd:dir,parentSession:root.id,origin:'subagent',delegationDepth:1},agentOptions:{provider:model.provider,model:model.id},setup(ctx,agent){applyChildComposition(ctx,root,{persona:frozenPersona,toolFilter:{allow:['read']}});if(complete)ctx.systemPrompt.section({name:'negative-complete',order:0,text:frozenPersona,complete:true});agent.session.append('subagent/descriptor',descriptor)}});handles.push(childHandle)
  let child=childHandle.agent
  async function drive(agent=child){agent.followup(createUserMessage({source:{kind:'user'},content:[{type:'text',text:'Review the assigned source; preserve history.'}]}));await agent.whenIdle()}
  return{host,run,task,root,get child(){return child},team,teamFile,requests,errors,journal,drive,setPrepareHook:fn=>prepareHook=fn,setCatalog:rows=>catalog=rows,setInheritedReceipt:()=>inheritedReceipt=true,async discardChild(){await childHandle.dispose()},async unloadPolicy(){policyEnabled=false;await policyFiber.dispose()},async coldResume(){await childHandle.dispose();const resumed=await host.agents.resume({resumeSessionId:'policy-child',parentAgent:root,agentOptions:{provider:model.provider,model:model.id},setup(ctx){applyChildComposition(ctx,root,{persona:descriptor.persona,toolFilter:descriptor.toolFilter})}});handles.push(resumed);child=resumed.agent;return child},async remount(){await policyFiber.dispose();policyFiber=host.plugin({inject:['agents','systemPrompt','subagents','sessionController'],apply(ctx){install(ctx)}});fibers.push(policyFiber);await policyFiber.await()},saveTeam:()=>writeFile(teamFile,JSON.stringify(team))}
}

test('A real rc2 loop serializes owned member current SYSTEM policy without changing frozen role or model',{timeout:20000},async t=>{
  const f=await fixture(t);await f.drive()
  assert.equal(f.requests.length,1,JSON.stringify(f.errors));const request=f.requests[0],wire=JSON.parse(request.json)
  assert.equal(request.marked,true);assert.equal(request.frozen,true);assert.equal(wire.provider,model.provider);assert.equal(wire.model,model.id)
  const system=wire.messages.filter(m=>m.role==='system').map(m=>m.content.map(b=>b.text??'').join('\n')).join('\n')
  assert.match(system,/You are reviewer/);assert.match(system,/PRIMARY/);assert.match(system,/OWN 5000000/);assert.match(system,/optional/)
  assert.equal(f.team.tasks[0].attemptId,'member-attempt');assert.equal(f.team.members[0].role,'independent reviewer');assert.equal(f.child.options.provider,model.provider)
  const before=f.requests.length;await f.remount();assert.equal(f.requests.length,before);await f.drive();assert.equal(f.requests.length,2);assert.equal((JSON.parse(f.requests[1].json).messages.filter(m=>m.role==='system').at(-1).content.map(b=>b.text).join('\n').match(/Current owned delivery policy/g)||[]).length,1)
  await f.drive(f.root);assert.equal(f.requests.length,3)
})
test('A complete persona cannot silently suppress effective policy and reach adapter',{timeout:20000},async t=>{
  const f=await fixture(t,{complete:true});await f.drive();assert.equal(f.requests.length,0);assert.ok(f.errors.some(e=>/policy|assembly/i.test(e)))
})
test('A actual private persistent cold resume retains descriptor, role, attempt and native SYSTEM policy',{timeout:20000},async t=>{
  const f=await fixture(t,{persistence:true});await f.drive();const first=f.child,history=first.session.snapshotEvents();await f.coldResume();assert.notEqual(f.child,first);assert.deepEqual(f.child.session.snapshotEvents().slice(0,history.length),history);await f.drive();assert.equal(f.requests.length,2,JSON.stringify(f.errors));assert.match(f.requests[1].json,/PRIMARY/);assert.equal(f.team.tasks[0].attemptId,'member-attempt')
})
test('A diagnostics without agent and HMR policy changes never wake held roots or members',{timeout:20000},async t=>{
 const f=await fixture(t);const noAgent=await f.host.systemPrompt.assemble();assert.doesNotMatch(JSON.stringify(noAgent),/Current owned delivery policy/)
 f.task.status='parked';f.task.holdRevision=3;f.run.coordinatorRevision++;await f.remount();assert.equal(f.requests.length,0);assert.equal(f.root.inbox.nextStep.length+f.root.inbox.nextTurn.length+f.child.inbox.nextStep.length+f.child.inbox.nextTurn.length,0)
 await f.drive();assert.equal(f.requests.length,0);assert.ok(f.errors.some(e=>/hold|policy/i.test(e)));assert.equal(f.team.tasks[0].attemptId,'member-attempt')
})
test('A causal frozen-policy baseline replay uses actual serialized loop request, not missing export/setup',{timeout:20000},async t=>{
 const f=await fixture(t);await f.unloadPolicy();await f.drive();assert.equal(f.requests.length,1);assert.equal(f.requests[0].marked,true);assert.equal(f.requests[0].frozen,true);assert.match(f.requests[0].json,/max-tokens-budget 1000000/);assert.doesNotMatch(f.requests[0].json,/Current owned delivery policy/)
})
for(const invalid of ['catalog','removed','ambiguous','label','stopping','reassigning','copied-descriptor','wrongscope'])test(`A real owned member rejects ${invalid} binding without adapter dispatch`,{timeout:20000},async t=>{
 const f=await fixture(t)
 if(invalid==='catalog')f.setCatalog([])
 if(invalid==='removed')f.team.members[0].status='removed'
 if(invalid==='ambiguous')f.team.tasks.push({...f.team.tasks[0],id:'t2',attemptId:'other'})
 if(invalid==='label')f.team.members[0].name='foreign'
 if(invalid==='stopping')f.team.members[0].stopping=true
 if(invalid==='reassigning')f.team.tasks[0].reassigning=true
 if(invalid==='wrongscope')f.team.description='Delivery task foreign-task'
 if(invalid==='copied-descriptor')f.setInheritedReceipt()
 await f.saveTeam();await f.drive();assert.equal(f.requests.length,0);assert.ok(f.errors.some(e=>/member|attempt|catalog|identity|receipt|scope/i.test(e)))
})
test('A actual retry-like later request requires refreshed policy and each independent review has own 5M',{timeout:20000},async t=>{
 const f=await fixture(t);await f.drive();f.run.coordinatorRevision++;f.task.assignmentConfig={...f.task.assignmentConfig,ocrMaxTokensBudget:5_000_000};await f.drive();assert.equal(f.requests.length,2);for(const r of f.requests)assert.match(r.json,/OWN 5000000/);assert.notEqual(f.requests[0].json,f.requests[1].json);assert.equal(f.errors.length,0)
})
test('A own descriptor, not copied inherited prefix, is required before real loop admission',{timeout:20000},async t=>{
 const f=await fixture(t),events=f.child.session.snapshotEvents();await f.discardChild()
 const h=await f.host.agents.create({sessionId:'policy-child',parentAgent:f.root,meta:{cwd:f.root.session.header.cwd,parentSession:f.root.id,origin:'subagent',isSeeded:true,delegationDepth:1},inheritedEventCount:events.length,seed:events,agentOptions:{provider:model.provider,model:model.id},setup(ctx){applyChildComposition(ctx,f.root,{persona:frozenPersona,toolFilter:{allow:['read']}})}});t.after(()=>h.dispose());await f.drive(h.agent);assert.equal(f.requests.length,0);assert.ok(f.errors.some(e=>/lineage|descriptor/i.test(e)))
})
test('A first-request creation setup awaits ownership publication and has no policy-only wake',{timeout:20000},async t=>{
 const f=await fixture(t);assert.equal(f.requests.length,0);await f.drive();assert.equal(f.requests.length,1);assert.equal(f.errors.length,0)
})
test('A trusted prepend short-circuit is diagnosable but not falsely claimed an unoverrideable guard',{timeout:20000},async t=>{
 const f=await fixture(t);let intercepted=false
 f.host.on('llm/stream',function*(){intercepted=true;yield*chunks},{prepend:true})
 await f.drive();assert.equal(intercepted,true);assert.equal(f.requests.length,0);assert.equal(f.errors.length,0)
})
test('A downstream request listener cannot swallow stale rejection and dispatch its adapter',{timeout:20000},async t=>{
 const f=await fixture(t);f.child.ctx.on('agent/request',async(_p,next)=>{const config=await next();f.run.coordinatorRevision++;return config});f.host.on('llm/stream',async function*(_o,next){try{yield*next()}catch{yield*chunks}})
 await f.drive();assert.equal(f.requests.length,0);assert.ok(f.errors.some(e=>/policy/i.test(e)))
})
for(const boundary of ['assembly','prestep','request','iterator'])test(`A actual loop rejects revision race at ${boundary}`,{timeout:20000},async t=>{
 const f=await fixture(t);let changed=false
 const change=()=>{if(!changed){changed=true;f.run.coordinatorRevision++}}
 if(boundary==='assembly')f.host.on('system-prompt/assemble',async(_a,_c,next)=>{const result=await next();change();return result})
 if(boundary==='prestep')f.child.ctx.on('agent/pre-step',async(_p,next)=>{change();return next()})
 if(boundary==='request')f.child.ctx.on('agent/request',async(_p,next)=>{const config=await next();change();return config})
 if(boundary==='iterator')f.host.on('llm/stream',(_o,next)=>{change();return next()})
 await f.drive();assert.equal(changed,true);assert.equal(f.requests.length,0,JSON.stringify(f.errors));assert.ok(f.errors.some(e=>/policy|Stale/i.test(e)))
})
test('A foreign one-shot and nested sessions do not inherit assignment SYSTEM policy',{timeout:20000},async t=>{
 const f=await fixture(t),handles=[];t.after(async()=>{for(const h of handles.reverse())await h.dispose()})
 for(const kind of ['one-shot','nested','unrelated']){
  const parent=kind==='nested'?f.child:kind==='unrelated'?undefined:f.root
  const h=await f.host.agents.create({sessionId:kind,parentAgent:parent,meta:{cwd:f.root.session.header.cwd,...parent?{parentSession:parent.id,origin:'subagent',delegationDepth:2}:{}},agentOptions:{provider:model.provider,model:model.id},setup(ctx,agent){if(parent)applyChildComposition(ctx,parent,{persona:'Foreign independent role'});if(kind==='one-shot')agent.session.append('subagent/descriptor',snapshotSubagentDescriptor({mode:'one-shot',provider:'spawn',label:'agent-teams:policy-team:reviewer'}))}});handles.push(h)
  const before=f.requests.length;await f.drive(h.agent)
  if(kind==='one-shot'){assert.equal(f.requests.length,before);assert.ok(f.errors.some(e=>/descriptor|catalog/i.test(e)))}else{assert.equal(f.requests.length,before+1);assert.doesNotMatch(f.requests.at(-1).json,/Current owned delivery policy/)}
 }
})
for(const race of ['revision','pause','WAIT','attempt'])test(`A real prepareCall await ${race} rejects stale frozen request before adapter`,{timeout:20000},async t=>{
  const f=await fixture(t);f.setPrepareHook(async()=>{if(race==='revision')f.run.coordinatorRevision++;if(race==='pause')f.run.status='paused';if(race==='WAIT')f.task.holdRevision=(f.task.holdRevision??0)+1;if(race==='attempt'){f.team.tasks[0].attemptId='new-attempt';await f.saveTeam()}})
  await f.drive();assert.equal(f.requests.length,0);assert.ok(f.errors.some(e=>/policy|stale|owned/i.test(e)),JSON.stringify(f.errors))
})
