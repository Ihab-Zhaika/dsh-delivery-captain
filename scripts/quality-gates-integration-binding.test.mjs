import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,dirname} from 'node:path'
import {verdictScopePatterns,bindReviewToRevision,canDeclareDelivery} from '../lib/quality-gates.js'
import {snapshotWorkspacePaths,readArtifactScope} from '../lib/artifacts.js'
import {registerAgentTeamsTools} from '../lib/tools.js'
import {createTeamDir,readTeam} from '../lib/state.js'

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

test('public task creation, scheduler start and verdict closure persist all integration bytes',async t=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'public-integration-')));t.after(async()=>{assert.equal(await realpath(root),root);assert.equal(dirname(root),await realpath(tmpdir()));await rm(root,{recursive:true,force:true})});await mkdir(join(root,'src'))
 const paths=Array.from({length:20},(_,i)=>`src/item-${i}.txt`);for(const path of paths)await writeFile(join(root,path),'Real source bytes\n')
 const now=Date.now(),base={subject:'Verified artifact',status:'completed',attempt:1,dependencies:[],assignee:'captain',objective:'Source artifact',inScope:['src/'],acceptance:['Artifact exists'],verify:['fixture verification'],createdAt:now,updatedAt:now}
 const team={id:'native-binding',name:'Native binding',captainSessionId:'captain',createdAt:now,taskSeq:2,phase:'running',members:[{id:'reader',name:'reviewer',joinedAt:now,status:'idle'}],tasks:[{...base,id:'t1',kind:'implementation',changedPaths:paths.slice(0,16)},{...base,id:'t2',kind:'integration',dependencies:['t1'],changedPaths:paths.slice(16)}]}
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
