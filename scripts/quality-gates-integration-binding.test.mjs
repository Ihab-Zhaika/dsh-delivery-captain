import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,dirname} from 'node:path'
import {verdictScopePatterns,bindReviewToRevision,canDeclareDelivery,verdictAuditNotes,hasValidQualityTaskFields} from '../lib/quality-gates.js'
import {snapshotWorkspacePaths,readArtifactScope} from '../lib/artifacts.js'
import {registerAgentTeamsTools} from '../lib/tools.js'
import {createTeamDir,readTeam} from '../lib/state.js'
import {auditTeamWorkspace} from '../lib/workspace-audit.js'
import {installTeamScheduler} from '../lib/scheduler.js'

test('integration review includes new integration paths and required upstream repair bytes at start and close',async t=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'integration-binding-')));t.after(async()=>{assert.equal(await realpath(root),root);assert.equal(dirname(root),await realpath(tmpdir()));await rm(root,{recursive:true,force:true})})
 const paths=Array.from({length:20},(_,i)=>`src/file-${i}.txt`);await mkdir(join(root,'src'));for(const [i,path]of paths.entries())await writeFile(join(root,path),`actual bytes ${i}\n`)
 const implementation={id:'source',kind:'implementation',status:'completed',attempt:1,dependencies:[],inScope:['src/'],changedPaths:paths.slice(0,15)}
 const repair={id:'repair',kind:'repair',status:'completed',attempt:2,dependencies:['source'],sourceTaskId:'source',inScope:['src/'],changedPaths:[paths[15]]}
 const before={id:'before-review',kind:'review',status:'completed',verdict:'pass',createdAt:1,dependencies:['repair'],reviewedTaskId:'repair',reviewedAttempt:2,reviewedArtifacts:readArtifactScope(root,paths.slice(0,16)).artifacts,reviewedScope:paths.slice(0,16)}
 const integration={id:'merge',kind:'integration',status:'completed',attempt:3,dependencies:['before-review'],inScope:['src/'],changedPaths:paths.slice(16)}
 const review={id:'whole-review',kind:'review',status:'in_progress',createdAt:2,dependencies:['merge'],reviewedTaskId:'merge',inScope:['reports/own-review.md']}
 const team={tasks:[implementation,repair,before,integration,review],members:[]};const scope=verdictScopePatterns(team,review)
 assert.deepEqual([...scope].sort(),[...paths].sort(),'Source lineage must include integration-only files; a narrow target cannot omit earlier repair/source')
 const start=snapshotWorkspacePaths(root,scope);assert.equal(start.artifacts.length,20);assert.ok(start.artifacts.every(a=>a.present&&a.sha256));assert.deepEqual(start.gaps??[],[])
 await mkdir(join(root,'reports'));await writeFile(join(root,'reports/own-review.md'),'Actual review output does not become judged source drift\n')
 const closed=bindReviewToRevision(team,{...review,status:'completed',verdict:'pass'},{...readArtifactScope(root,verdictScopePatterns(team,review)),scope})
 assert.equal(closed.reviewedTaskId,'merge');assert.equal(closed.reviewedAttempt,3);assert.equal(closed.reviewedArtifacts.length,20)
 const done={...team,tasks:[implementation,repair,before,integration,closed]};assert.equal(canDeclareDelivery(done,{...readArtifactScope(root,scope)}).ok,true)
 await writeFile(join(root,paths[19]),'changed after review\n');assert.equal(canDeclareDelivery(done,{...readArtifactScope(root,scope)}).ok,false,'Integration-only changes must invalidate the genuine full verdict')
 await writeFile(join(root,paths[19]),'actual bytes 19\n');assert.equal(canDeclareDelivery(done,{...readArtifactScope(root,scope)}).ok,true,'Restored exact bytes must pass before checking deletion independently')
 await rm(join(root,paths[18]));assert.equal(canDeclareDelivery(done,{...readArtifactScope(root,scope)}).ok,false,'Deleted integration-only source must not pass')
 assert.equal((await readFile(join(root,'reports/own-review.md'),'utf8')).startsWith('Actual'),true)
})

test('legacy integration directory scope binds its contents while excluding reviewer output',async t=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'integration-scope-')));t.after(async()=>{assert.equal(await realpath(root),root);assert.equal(dirname(root),await realpath(tmpdir()));await rm(root,{recursive:true,force:true})})
 await mkdir(join(root,'lib'));await mkdir(join(root,'reports'));await writeFile(join(root,'source.txt'),'upstream source\n');await writeFile(join(root,'lib/generated.js'),'integration artifact\n');await writeFile(join(root,'reports/own.md'),'reviewer output\n')
 const source={id:'source',kind:'implementation',status:'completed',attempt:1,changedPaths:['source.txt'],dependencies:[]},integration={id:'integration',kind:'integration',status:'completed',attempt:1,inScope:['lib/'],dependencies:['source']},review={id:'review',kind:'review',status:'in_progress',createdAt:2,reviewedTaskId:'integration',dependencies:['integration'],inScope:['reports/own.md']},team={tasks:[source,integration,review],members:[]}
 const scope=verdictScopePatterns(team,review);assert.deepEqual(readArtifactScope(root,scope).artifacts.map(a=>a.path).sort(),['lib/generated.js','source.txt'])
 const closed=bindReviewToRevision(team,{...review,status:'completed',verdict:'pass'},{...readArtifactScope(root,scope),scope}),done={...team,tasks:[source,integration,closed]}
 const audit=()=>{const read=readArtifactScope(root,scope);return {...read,expandedScope:read.artifacts.map(a=>({path:a.path,present:a.present}))}}
 assert.deepEqual(verdictAuditNotes(done,audit()),[])
 await writeFile(join(root,'lib/new.js'),'new integration artifact\n');assert.equal(readArtifactScope(root,scope).artifacts.length,3,'A broad integration contract must retain enumeration of newly added source')
 assert.notDeepEqual(verdictAuditNotes(done,audit()),[],'New integration files must invalidate a closed delivery verdict')
 assert.equal(canDeclareDelivery(done,audit()).ok,false)
 assert.equal(scope.includes('reports/own.md'),false)
})

for (const pattern of ['.', './', '.\\']) test(`legacy integration root pattern ${pattern} retains post-verdict new-file detection`,async t=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'integration-root-')));t.after(async()=>{assert.equal(await realpath(root),root);assert.equal(dirname(root),await realpath(tmpdir()));await rm(root,{recursive:true,force:true})})
 await writeFile(join(root,'source.txt'),'source\n')
 const source={id:'source',kind:'implementation',changedPaths:['source.txt'],dependencies:[]},integration={id:'integration',kind:'integration',attempt:1,inScope:[pattern],dependencies:['source']},review={id:'review',kind:'review',createdAt:2,reviewedTaskId:'integration',dependencies:['integration'],inScope:['own-report.md']},team={tasks:[source,integration,review]}
 const scope=verdictScopePatterns(team,review);assert.ok(scope.includes(pattern.replaceAll('\\','/')));const read=readArtifactScope(root,scope);assert.deepEqual(read.gaps,[])
 const closed=bindReviewToRevision(team,{...review,status:'completed',verdict:'pass'},{...read,scope}),done={...team,tasks:[source,integration,closed]}
 const audit=()=>{const r=readArtifactScope(root,scope);return {...r,expandedScope:r.artifacts.map(a=>({path:a.path,present:a.present}))}}
 assert.deepEqual(verdictAuditNotes(done,audit()),[])
 await writeFile(join(root,'new.txt'),'new source\n');assert.notDeepEqual(verdictAuditNotes(done,audit()),[])
})

test('already recorded Windows directory scope rejects additions',async t=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'windows-verdict-')));t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(join(root,'lib'));await writeFile(join(root,'lib/a.js'),'source\n')
 const source={id:'source',kind:'integration',status:'completed',attempt:1,dependencies:[],inScope:['lib\\']},review={id:'review',kind:'review',status:'completed',verdict:'pass',createdAt:1,reviewedTaskId:'source',dependencies:['source']},team={tasks:[source,review],members:[]}
 team.tasks[1]=bindReviewToRevision(team,review,{...readArtifactScope(root,['lib\\']),scope:['lib\\']});await writeFile(join(root,'lib/new.js'),'never reviewed\n')
 assert.equal(canDeclareDelivery(team,auditTeamWorkspace(root,team)).ok,false)
})

async function publicOutputFixture(t,{output='own-report.md',changedPaths=['source.txt'],sourceScope=['source.txt'],integrationScope=['.'],outOfScope,existingReport=false,sourceContractSnapshot=false,startMode='scheduled'}={}){
 const root=await realpath(await mkdtemp(join(tmpdir(),'public-output-')));t.after(async()=>{assert.equal(dirname(root),await realpath(tmpdir()));await rm(root,{recursive:true,force:true})});await writeFile(join(root,'source.txt'),'source\n');await writeFile(join(root,'other.txt'),'other source\n')
 if(existingReport)await writeFile(join(root,'own-report.md'),'initial evidence\n')
 const now=Date.now(),base={subject:'Actual source',status:'completed',attempt:1,assignee:'captain',objective:'Actual source',acceptance:['Source exists'],verify:['fixture'],createdAt:now,updatedAt:now}
 const team={id:'output-team',name:'Output team',captainSessionId:'captain',createdAt:now,taskSeq:2,phase:'running',members:[{id:'reader',name:'reviewer',joinedAt:now,status:'idle'}],tasks:[{...base,id:'t1',kind:'implementation',dependencies:[],changedPaths,inScope:sourceScope,...sourceContractSnapshot?{contractSnapshot:snapshotWorkspacePaths(root,['own-report.md'])}:{}},{...base,id:'t2',kind:'integration',dependencies:['t1'],inScope:integrationScope}]}
 await createTeamDir(join(root,'.agent-teams'),team)
 const make=(id,origin,parentSession)=>({id,status:'idle',session:{id,header:{cwd:root,origin,parentSession},events:[],inheritedEventCount:0,append(){}},inbox:{nextTurn:[],nextStep:[]}}),captain=make('captain','root'),reader=make('reader','subagent','captain'),agents=new Map([['captain',captain],['reader',reader]]),tools=new Map()
 const ctx={agents:{get:id=>agents.get(id),list:()=>[...agents.values()]},subagents:{followup:async()=>{reader.status='running';return'fixture'},registerContinuableSetup(){},start(){},startContinuable(){},interrupt(){}},tools:{register:tool=>tools.set(tool.name,tool)},get(key){return this[key]},on(){return()=>{}},effect(effect){return effect()},logger:{warn(){},debug(){}},emit(){}}
 registerAgentTeamsTools(ctx,{stateDir:'.agent-teams',memberProvider:'fork',maxMembers:2,profiles:{},toolPolicies:{}})
 if(startMode!=='scheduled')reader.status='running'
 const exec=agent=>({agent,signal:new AbortController().signal,callId:'fixture'}),created=await tools.get('agent_teams_create_task').execute({subject:'Review actual source',kind:'review',...startMode==='scheduled'?{assignee:'reviewer'}:{},dependencies:['t2'],reviewedTaskId:'t2',objective:'Review source',acceptance:['Source inspected'],inScope:[output],...outOfScope?{outOfScope}:{}},exec(captain))
 const state=()=>readTeam(join(root,'.agent-teams'),team.id),task=async()=>(await state()).tasks.find(item=>item.id===created.task_id)
 const createdTask=await task(),owner=startMode==='captain'?captain:reader
 if(startMode==='captain')await tools.get('agent_teams_reassign_task').execute({task_id:createdTask.id,assignee:'captain',reason:'Actual public takeover fixture'},exec(captain))
 else await tools.get('agent_teams_claim_task').execute({task_id:createdTask.id},exec(reader))
 const review=await task();if(startMode!=='captain')await tools.get('agent_teams_update_task').execute({task_id:review.id,attempt_id:review.attemptId,status:'in_progress'},exec(reader))
 const close=()=>tools.get('agent_teams_update_task').execute({task_id:review.id,attempt_id:review.attemptId,status:'completed',verdict:'pass',output:'Real fixture inventory only, no live semantic approval',findings:[]},exec(owner))
 const delivery=async()=>{const current=await state();return canDeclareDelivery(current,auditTeamWorkspace(root,current))}
 return{root,task,state,close,delivery,tools,exec,captain,reader,ctx}
}

for(const startMode of ['direct','captain'])for(const mutation of ['addition','removal','exclusion-amendment','own-output'])test(`public ${startMode} verdict start freezes source and outputs for ${mutation}`,async t=>{
 const f=await publicOutputFixture(t,{startMode,existingReport:true}),started=await f.task()
 assert.ok(started.attemptId);assert.equal(started.attempt,1)
 if(mutation==='addition')await writeFile(join(f.root,'new-source.txt'),'new source during attempt\n')
 if(mutation==='removal')await rm(join(f.root,'other.txt'))
 if(mutation==='exclusion-amendment')await f.tools.get('agent_teams_amend_task').execute({task_id:started.id,reason:'New evidence target during the same attempt',inScope:['new-report.md']},f.exec(f.captain))
 if(mutation==='own-output')await writeFile(join(f.root,'own-report.md'),'legitimate writable evidence\n')
 await f.close();assert.equal((await f.delivery()).ok,mutation==='own-output',`${startMode} must enforce the same source/exclusion contract as scheduled admission`)
 const bound=await f.task();assert.ok(bound.reviewedScope.includes('.'))
 if(mutation==='own-output')assert.deepEqual(bound.reviewedExcludedPaths,['own-report.md'])
})

test('public captain-to-member handoff freezes a fresh source verdict and rejects the old capability',async t=>{
 const f=await publicOutputFixture(t,{startMode:'captain'}),old=await f.task();f.reader.status='idle'
 await f.tools.get('agent_teams_reassign_task').execute({task_id:old.id,assignee:'reviewer',reason:'Actual supported handoff fixture'},f.exec(f.captain))
 const next=await f.task();assert.notEqual(next.attemptId,old.attemptId);assert.equal(next.attempt,old.attempt+1);assert.deepEqual(next.verdictStartExcludedPaths,['own-report.md']);assert.ok(next.verdictStartSnapshot.artifacts.length)
 await assert.rejects(f.close(),/attempt|assigned|owned|stale/i)
 await f.tools.get('agent_teams_claim_task').execute({task_id:next.id},f.exec(f.reader));await f.tools.get('agent_teams_update_task').execute({task_id:next.id,attempt_id:next.attemptId,status:'in_progress'},f.exec(f.reader))
 await writeFile(join(f.root,'new-source.txt'),'source added during the fresh handoff\n')
 await f.tools.get('agent_teams_update_task').execute({task_id:next.id,attempt_id:next.attemptId,status:'completed',verdict:'pass',output:'Fixture only',findings:[]},f.exec(f.reader));assert.equal((await f.delivery()).ok,false)
})

test('public root review excludes only its frozen exact output during and after closure',async t=>{
 const f=await publicOutputFixture(t,{existingReport:true});await writeFile(join(f.root,'own-report.md'),'review evidence\n');await f.close();assert.equal((await f.delivery()).ok,true,'Writing declared evidence must not invalidate source')
 const closed=await f.task();assert.deepEqual(closed.reviewedExcludedPaths,['own-report.md']);assert.equal(closed.reviewedArtifacts.some(a=>a.path==='own-report.md'),false)
 await writeFile(join(f.root,'own-report.md'),'later evidence\n');assert.equal((await f.delivery()).ok,true)
 await writeFile(join(f.root,'unrelated-new.txt'),'never reviewed\n');assert.equal((await f.delivery()).ok,false,'Root scope must still reject unrelated additions')
})

test('source overlapping a declared review output stays bound',async t=>{
 const f=await publicOutputFixture(t,{output:'source.txt'});await f.close();assert.equal((await f.delivery()).ok,true);await writeFile(join(f.root,'source.txt'),'changed source\n');assert.equal((await f.delivery()).ok,false)
 await writeFile(join(f.root,'source.txt'),'source\n');assert.equal((await f.delivery()).ok,true);await rm(join(f.root,'source.txt'));assert.equal((await f.delivery()).ok,false)
})

test('a report first created after public verdict closure is excluded without hiding other source',async t=>{
 const f=await publicOutputFixture(t);assert.deepEqual((await f.task()).verdictStartExcludedPaths,['own-report.md']);await f.close();await writeFile(join(f.root,'own-report.md'),'new evidence\n');assert.equal((await f.delivery()).ok,true)
 await writeFile(join(f.root,'other.txt'),'changed actual source\n');assert.equal((await f.delivery()).ok,false)
})

test('unrelated source added during public root review cannot be absorbed at closure',async t=>{
 const f=await publicOutputFixture(t);await writeFile(join(f.root,'unrelated-new.txt'),'moving source inventory\n');await f.close()
 assert.equal((await f.delivery()).ok,false,'Only the frozen report output may be added during review without source drift')
})

test('an explicit empty exclusion binding clears stale output metadata',()=>{
 const source={id:'source',kind:'implementation',attempt:1,dependencies:[]},review={id:'review',kind:'review',dependencies:['source'],reviewedTaskId:'source',reviewedExcludedPaths:['source.txt']},team={tasks:[source,review]}
 const bound=bindReviewToRevision(team,review,{artifacts:[{path:'source.txt',present:true,sha256:'a'.repeat(64)}],scope:['.'],excludedPaths:[]})
 assert.deepEqual(bound.reviewedExcludedPaths,[])
})

test('empty artifact binding preserves source scope, enumeration gaps and drift without passing',()=>{
 const source={id:'source',kind:'integration',status:'completed',attempt:2,dependencies:[]},review={id:'review',kind:'review',status:'completed',verdict:'pass',dependencies:['source'],reviewedTaskId:'source'},team={tasks:[source,review],members:[]}
 const bound=bindReviewToRevision(team,review,{artifacts:[],scope:['.'],gaps:[{pattern:'.',reason:'Actual enumeration failed'}],duringDrift:['Source vanished during review'],excludedPaths:['own-report.md']})
 assert.deepEqual(bound.reviewedScope,['.']);assert.equal(bound.reviewedAttempt,2);assert.deepEqual(bound.reviewedGaps,[{pattern:'.',reason:'Actual enumeration failed'}]);assert.ok(bound.reviewedDuringDrift.includes('Source vanished during review'))
 assert.equal(hasValidQualityTaskFields(bound),true);assert.equal(canDeclareDelivery({...team,tasks:[source,bound]},{artifacts:[]}).ok,false)
 const empty=bindReviewToRevision(team,review,{artifacts:[],scope:['.'],excludedPaths:['own-report.md']})
 assert.match(empty.reviewedDuringDrift.join(' '),/No source artifacts/);assert.equal(canDeclareDelivery({...team,tasks:[source,empty]},{artifacts:[]}).ok,false,'An initially empty report-only scope is not a source review pass')
})

test('public review cannot turn removed source plus an excluded report into an empty-source pass',async t=>{
 const f=await publicOutputFixture(t,{changedPaths:[],sourceScope:['unrelated.txt'],existingReport:true});await rm(join(f.root,'source.txt'));await rm(join(f.root,'other.txt'));await f.close()
 const bound=await f.task();assert.equal((await f.delivery()).ok,false);assert.deepEqual(bound.reviewedScope,['.']);assert.deepEqual(bound.reviewedArtifacts,[])
 assert.match(bound.reviewedDuringDrift.join(' '),/deleted|source artifacts/i)
 await writeFile(join(f.root,'new-source.txt'),'source appearing under retained scope\n');assert.equal((await f.delivery()).ok,false)
})

test('upstream generated contract snapshot cannot be excluded as a reviewer output',async t=>{
 const f=await publicOutputFixture(t,{existingReport:true,sourceContractSnapshot:true});await f.close();assert.equal((await f.delivery()).ok,true)
 assert.deepEqual((await f.task()).reviewedExcludedPaths??[],[]);await writeFile(join(f.root,'own-report.md'),'changed cited source\n');assert.equal((await f.delivery()).ok,false)
})

test('public Windows root and exact output spellings share the canonical evidence identity',async t=>{
 const f=await publicOutputFixture(t,{output:'.\\own-report.md',integrationScope:['.\\'],existingReport:true})
 await writeFile(join(f.root,'own-report.md'),'new reviewer evidence\n');await f.close();assert.equal((await f.delivery()).ok,true)
 assert.deepEqual((await f.task()).reviewedExcludedPaths,['own-report.md']);assert.ok((await f.task()).reviewedScope.includes('./'))
 await writeFile(join(f.root,'new-source.txt'),'never reviewed\n');assert.equal((await f.delivery()).ok,false)
})

test('Windows case variants cannot exclude a source file declared as review output',{skip:process.platform!=='win32'},async t=>{
 const f=await publicOutputFixture(t,{output:'OTHER.TXT',changedPaths:['source.txt','other.txt'],sourceScope:['source.txt','other.txt']});await f.close();assert.equal((await f.delivery()).ok,true)
 assert.equal((await f.task()).reviewedExcludedPaths?.includes('OTHER.TXT')??false,false);await writeFile(join(f.root,'other.txt'),'changed source\n');assert.equal((await f.delivery()).ok,false)
})

for(const protection of ['source-scope','integration-file','directory-output','out-of-scope'])test(`public review output exclusion retains ${protection} evidence`,async t=>{
 const options=protection==='source-scope'?{output:'other.txt',sourceScope:['.']}:protection==='integration-file'?{output:'other.txt',integrationScope:['.','other.txt']}:protection==='directory-output'?{output:'.'}:{output:'own-report.md',outOfScope:['own-report.md'],existingReport:true}
 const f=await publicOutputFixture(t,options);await f.close();assert.equal((await f.delivery()).ok,true)
 assert.deepEqual((await f.task()).reviewedExcludedPaths??[],[])
 const path=protection==='out-of-scope'?'own-report.md':'other.txt';await writeFile(join(f.root,path),'changed judged bytes\n');assert.equal((await f.delivery()).ok,false)
})

test('frozen output metadata rejects directory, traversal and forbidden exclusions in durable task schema',()=>{
 for(const field of ['reviewedExcludedPaths','verdictStartExcludedPaths']){
  for(const path of ['.','reports/','../source.txt','C:\\source.txt','.env','secrets/output.md','*.md'])assert.equal(hasValidQualityTaskFields({kind:'review',[field]:[path]}),false,`${field}: ${path}`)
  assert.equal(hasValidQualityTaskFields({kind:'review',[field]:[]}),true);assert.equal(hasValidQualityTaskFields({kind:'review',[field]:['own-report.md']}),true)
 }
})

test('output classification cannot be changed during a real public review attempt',async t=>{
 const f=await publicOutputFixture(t)
 await f.tools.get('agent_teams_amend_task').execute({task_id:(await f.task()).id,reason:'Changed evidence target',inScope:['other-report.md']},f.exec(f.captain))
 await f.close();assert.equal((await f.delivery()).ok,false,'An amended exclusion contract requires a fresh review attempt')
 assert.match((await f.task()).reviewedDuringDrift.join(' '),/exclusion.*changed/i)
})

test('failed cold recovery dispatch restores the exact original frozen verdict contract',async t=>{
 const f=await publicOutputFixture(t),before=await f.task()
 await f.tools.get('agent_teams_amend_task').execute({task_id:before.id,reason:'Changed evidence target',inScope:['new-report.md']},f.exec(f.captain))
 f.reader.status='idle';let dispatches=0
 const scheduler=installTeamScheduler(f.ctx,{stateDir:'.agent-teams',dispatch:async()=>{dispatches++;return false}})
 await scheduler.kickMember(f.root,'output-team','reviewer',f.captain)
 const restored=await f.task();assert.equal(dispatches,1);assert.equal(restored.attemptId,before.attemptId);assert.equal(restored.attempt,before.attempt)
 assert.deepEqual(restored.verdictStartSnapshot,before.verdictStartSnapshot);assert.deepEqual(restored.verdictStartExcludedPaths,before.verdictStartExcludedPaths)
 await f.close();assert.equal((await f.delivery()).ok,false,'An unsuccessful recovery must not erase the original attempt amendment drift')
})

test('an explicitly empty integration change inventory differs from a missing legacy inventory',()=>{
 const source={id:'source',kind:'implementation',changedPaths:['source.txt'],dependencies:[]},integration={id:'integration',kind:'integration',changedPaths:[],inScope:['lib/'],dependencies:['source']},review={id:'review',kind:'review',reviewedTaskId:'integration',dependencies:['integration'],inScope:['own-report.md']}
 assert.deepEqual(verdictScopePatterns({tasks:[source,integration,review]},review),['source.txt'])
})

for (const inventory of ['changed-paths', 'declared-scope']) test(`public task creation, scheduler start and verdict closure persist all integration bytes (${inventory})`,async t=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'public-integration-')));t.after(async()=>{assert.equal(await realpath(root),root);assert.equal(dirname(root),await realpath(tmpdir()));await rm(root,{recursive:true,force:true})});await mkdir(join(root,'src'))
 const paths=Array.from({length:20},(_,i)=>`src/item-${i}.txt`);for(const path of paths)await writeFile(join(root,path),'Real source bytes\n')
 const now=Date.now(),base={subject:'Verified artifact',status:'completed',attempt:1,dependencies:[],assignee:'captain',objective:'Source artifact',inScope:['src/'],acceptance:['Artifact exists'],verify:['fixture verification'],createdAt:now,updatedAt:now}
 const team={id:'native-binding',name:'Native binding',captainSessionId:'captain',createdAt:now,taskSeq:2,phase:'running',members:[{id:'reader',name:'reviewer',joinedAt:now,status:'idle'}],tasks:[{...base,id:'t1',kind:'implementation',changedPaths:paths.slice(0,16)},{...base,id:'t2',kind:'integration',dependencies:['t1'],inScope:paths.slice(16),...(inventory==='changed-paths'?{changedPaths:paths.slice(16)}:{})}]}
 // Only temporary fixture state is seeded. Creation/start/close use the real
 // registered tools and scheduler; the delivery seam has no paid model.
 await createTeamDir(join(root,'.agent-teams'),team)
 const makeAgent=(id,origin,parentSession)=>({id,status:'idle',session:{id,header:{cwd:root,origin,parentSession},events:[],inheritedEventCount:0,append(){}},inbox:{nextTurn:[],nextStep:[]}})
 const captain=makeAgent('captain','root'),reader=makeAgent('reader','subagent','captain'),agents=new Map([['captain',captain],['reader',reader]]),tools=new Map()
 const ctx={agents:{get:id=>agents.get(id),list:()=>[...agents.values()]},subagents:{followup:async()=>{reader.status='running';return 'fixture-delivery'},registerContinuableSetup(){},start(){},startContinuable(){},interrupt(){}},tools:{register:tool=>tools.set(tool.name,tool)},get(key){return this[key]},on(){return()=>{}},effect(effect){return effect()},logger:{warn(){},debug(){}},emit(){}}
 registerAgentTeamsTools(ctx,{stateDir:'.agent-teams',memberProvider:'fork',maxMembers:2,profiles:{},toolPolicies:{}})
 const signal=new AbortController().signal,exec=agent=>({agent,signal,callId:'fixture-call'})
 const created=await tools.get('agent_teams_create_task').execute({subject:'Full actual integration review',kind:'review',assignee:'reviewer',dependencies:['t2'],reviewedTaskId:'t2',objective:'Inspect all source and integration bytes',acceptance:['All twenty source artifacts reviewed'],inScope:['reports/own-review.md']},exec(captain))
 let state=await readTeam(join(root,'.agent-teams'),team.id),review=state.tasks.find(task=>task.id===created.task_id)
 assert.equal(review.verdictStartSnapshot.artifacts.length,20)
 await tools.get('agent_teams_claim_task').execute({task_id:review.id},exec(reader))
 await tools.get('agent_teams_update_task').execute({task_id:review.id,attempt_id:review.attemptId,status:'in_progress'},exec(reader))
 await tools.get('agent_teams_update_task').execute({task_id:review.id,attempt_id:review.attemptId,status:'completed',verdict:'pass',output:'Fixture verified the real source inventory; no live semantic approval claimed',findings:[]},exec(reader))
 state=await readTeam(join(root,'.agent-teams'),team.id);review=state.tasks.find(task=>task.id===created.task_id)
 assert.equal(review.reviewedTaskId,'t2');assert.equal(review.reviewedAttempt,1);assert.equal(review.reviewedArtifacts.length,20)
 assert.deepEqual(review.reviewedArtifacts.map(a=>a.path).sort(),paths.sort())
})
