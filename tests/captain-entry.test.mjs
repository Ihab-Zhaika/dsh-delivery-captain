import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, name } from '../lib/captain.js'

test('installed captain stays inert, rejects ordinary tool use and authenticates API routes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'captain-entry-'))
  const tools = new Map(), routes = new Map(), commands = new Map(), disposers = [], sections = []
  let rejection
  const inspected = []
  const server = { register(route) { routes.set(route.path, route); return () => routes.delete(route.path) } }
  const ctx = {
    tools: { register(tool) { tools.set(tool.name, tool) } },
    systemPrompt: { section(section) { sections.push(section) } },
    commands: { register(command) { commands.set(command.name, command); return () => {} } },
    sessionController: { async inspect(id) { inspected.push(id); throw new Error('No current repository') } },
    get(key) { if (key === 'webServer') return server; if (key === 'connection') return { requestRejection: () => rejection } },
    on() { return () => {} },
    effect(create) { const dispose = create(); if (dispose) disposers.push(dispose); return dispose },
    inject(_keys, callback) { const dispose = callback(ctx); if (typeof dispose === 'function') disposers.push(dispose) },
  }
  try {
    await writeFile(join(dir,'native-control.json'),JSON.stringify({version:1,id:'native-control',captainSessionId:'coordinator',status:'stopped',config:{provider:'github',repository:'owner/repo',workspace:dir,milestones:['M1'],remote:'origin',targetBranch:'main',verifyCommands:['npm test']},tasks:[],tickets:[],questions:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}))
    await apply(ctx, { stateDirectory: dir })
    assert.equal(name, 'darkingdoom')
    assert.equal(tools.has('darkingdoom_start'), false)
    assert.equal(tools.has('darkingdoom_control'), true)
    assert.deepEqual(tools.get('darkingdoom_control').parameters.properties.action.enum,['finish-existing'])
    await assert.rejects(tools.get('darkingdoom_control').execute({action:'finish-existing'},{agent:{id:'ordinary'}}), /captain|enabled/)
    const closed=JSON.parse(await tools.get('darkingdoom_control').execute({action:'finish-existing'},{agent:{id:'coordinator'}}))
    assert.equal(closed.intakeMode,'existing-only');assert.equal(closed.status,'stopped');assert.equal(closed.admittedTickets,0)
    await assert.rejects(tools.get('darkingdoom_control').execute({action:'allow-new-tickets'},{agent:{id:'coordinator'}}),/finish-existing|human command/)
    const saved=JSON.parse(await readFile(join(dir,'native-control.json'),'utf8'))
    assert.equal(saved.intakeMode,'existing-only');assert.equal(saved.status,'stopped')
    assert.equal(tools.has('agent_teams_create'), false)
    assert.equal(sections[0].text({agent:{id:'ordinary'}}), '')
    await assert.rejects(tools.get('darkingdoom_report').execute({phase:'review',ready:true},{agent:{id:'ordinary'}}), /assigned worker/)
    const command = commands.get('darkingdoom')
    assert.equal((await command.handler({rawInput:'status',agent:{id:'ordinary'}})).text,'null')
    assert.equal((await command.handler({rawInput:'start {}',agent:{id:'ordinary'}})).kind,'error')
    // Status may inspect native lineage/workspace without activating an agent.
    assert.ok(inspected.length>0);assert.ok(inspected.every(id=>id==='ordinary'))
    let contextStatus, contextBody
    await routes.get('/api/darkingdoom/context').handler({method:'GET',url:'/api/darkingdoom/context?sessionId=other&workspace=C:/unrelated'},{writeHead(v){contextStatus=v},end(v){contextBody=JSON.parse(v)}})
    assert.equal(contextStatus,400)
    assert.match(contextBody.error,/No current repository/)
    assert.equal(inspected.at(-1),'other');assert.ok(inspected.slice(0,-1).every(id=>id==='ordinary'))
    for(const code of [401,403,undefined]) {
      rejection=code;let status,body
      await routes.get('/api/darkingdoom/state').handler({method:'GET',url:'/api/darkingdoom/state?sessionId=ordinary'},{writeHead(v){status=v},end(v){body=JSON.parse(v)}})
      assert.equal(status,code??200)
      if(!code)assert.equal(body.run,null)
    }
  } finally { for(const dispose of disposers.reverse())await dispose();await rm(dir,{recursive:true,force:true}) }
})

test('A registered native status audits full authorized recovery owners once but filters ordinary and foreign callers',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'captain-status-A-')),tools=new Map(),disposers=[],agents=new Map(),audit=[]
 const at=new Date().toISOString(),cfg={provider:'github',repository:'owner/repo',workspace:dir,milestones:['M1'],remote:'origin',targetBranch:'main',verifyCommands:['node --version']}
 const make=(id,sessionId,kind)=>({id,sessionId,kind,attempt:'attempt-'+id,baseSha:'a'.repeat(40),branch:'branch-'+id,worktree:dir,status:'blocked',phase:'waiting',phases:[],startedAt:at,reviewRounds:0,followups:[],ticket:{id,title:id,body:'scope',url:'',milestone:'M1',predecessors:[],state:'open',merged:false,priority:1,createdAt:at,labels:[]}})
 const ordinary=make('ordinary','ordinary-root'),recovery=make('recovery','recovery-root','recovery')
 const run={version:1,id:'run',captainSessionId:'coordinator',status:'stopped',config:cfg,tasks:[ordinary],tickets:[ordinary.ticket],questions:[],recoveryCampaign:{task:recovery,affectedTaskIds:[],fingerprint:'fixture'},createdAt:at,updatedAt:at}
 for(const id of ['ordinary-root','recovery-root','coordinator','samecwd-spoof'])agents.set(id,{id,status:'idle',options:{},session:{id,header:{id,cwd:dir},snapshotEvents:()=>[],ownEvents:()=>[]},inbox:{nextTurn:[],nextStep:[]},ctx:{on(){return()=>{}},effect(){}},cancel(){},async whenIdle(){}})
 let unknownJobs=false,callerRace=false
 const events=new Map(),catalog=new Map()
 const ctx={tools:{register(tool){tools.set(tool.name,tool)}},agents:{get:id=>agents.get(id),list:()=>[],isOwnedBy:(id,root)=>agents.get(id)?.session.header.parentSession===root.id},subagents:{listDescendants:async id=>{audit.push(id);if(callerRace)agents.set('recovery-root',{...agents.get('recovery-root')});return[]},listChildren:async id=>catalog.get(id)??[],drainContinuableChildren:async()=>{}},systemPrompt:{section(){}},commands:{register(){return()=>{}}},sessionController:{create:async()=>{},rename:async()=>{},inspect:async id=>({meta:{id,cwd:dir},inheritedEventCount:0,events:events.get(id)??[]})},get(name){if(name==='jobs')return{list:()=>{if(unknownJobs)throw new Error('fixture unavailable jobs');return[]}}},on(){return()=>{}},effect(create){const d=create();if(d)disposers.push(d)},inject(){}}
 try{
  await writeFile(join(dir,'run.json'),JSON.stringify(run));await apply(ctx,{stateDirectory:dir});const status=id=>tools.get('darkingdoom_status').execute({},{agent:agents.get(id)})
  const recovered=JSON.parse(await status('recovery-root'));assert.deepEqual(recovered.hostEvidence.workers.map(w=>w.taskId),['ordinary','recovery']);assert.equal(recovered.recoveryScope.length,1);assert.deepEqual(recovered.run.tasks.map(t=>t.id),['recovery'])
  const normal=JSON.parse(await status('ordinary-root'));assert.deepEqual(normal.hostEvidence.workers.map(w=>w.taskId),['ordinary']);assert.equal(normal.run.recoveryCampaign,undefined);assert.equal(normal.recoveryScope,undefined)
  await assert.rejects(status('samecwd-spoof'),/exact session|enabled/)
  const full=JSON.parse(await status('coordinator'));assert.equal(full.hostEvidence.workers.length,2);assert.ok(audit.includes('ordinary-root'))
  for(const root of ['ordinary-root','recovery-root']){
   const child=root+'-member',teamId=root+'-team',descriptor={version:3,mode:'continuable',provider:'spawn',label:`agent-teams:${teamId}:reviewer`}
   const a={id:child,status:'idle',options:{},session:{id:child,header:{id:child,cwd:dir,parentSession:root,origin:'subagent'},ownEvents:()=>[{type:'subagent/descriptor',seq:0,data:descriptor}]},inbox:{nextTurn:[],nextStep:[]},cancel(){},async whenIdle(){}}
   agents.set(child,a);catalog.set(root,[{id:child,mode:'continuable',label:descriptor.label}]);events.set(root,[{type:'tool/call',seq:0,data:{callId:'create',name:'agent_teams_create',arguments:JSON.stringify({name:teamId,approval:'automatic',description:`Delivery task ${root==='ordinary-root'?'ordinary':'recovery'}`})}},{type:'tool/result',seq:1,sourceEventSeqs:[0],data:{message:{toolCallId:'create',isError:false},meta:{team_id:teamId,team_name:teamId,captain_session_id:root}}}])
   const team={id:teamId,name:teamId,phase:'running',captainSessionId:root,createdAt:Date.now(),taskSeq:1,description:`Delivery task ${root==='ordinary-root'?'ordinary':'recovery'}`,members:[{id:child,name:'reviewer',joinedAt:Date.now(),status:'idle'}],tasks:[{id:'t1',subject:'Review current source',dependencies:[],createdAt:Date.now(),updatedAt:Date.now(),assignee:'reviewer',status:'in_progress',attempt:1,attemptId:'member-attempt'}]};await mkdir(join(dir,'.agent-teams',teamId),{recursive:true});await writeFile(join(dir,'.agent-teams',teamId,'team.json'),JSON.stringify(team))
   const projected=JSON.parse(await status(child));assert.equal(projected.hostEvidence.workers.length,root==='ordinary-root'?1:2);assert.equal(projected.recoveryScope!==undefined,root==='recovery-root')
  }
  unknownJobs=true;const unknown=JSON.parse(await status('recovery-root'));assert.ok(unknown.hostEvidence.workers.every(w=>w.execution.active===null));unknownJobs=false
  await assert.rejects(tools.get('darkingdoom_status').execute({},{agent:{...agents.get('coordinator')}}),/exact registered caller/)
  callerRace=true;await assert.rejects(status('recovery-root'),/registered agent|ownership changed/)
 }finally{for(const d of disposers.reverse())await d();await rm(dir,{recursive:true,force:true})}
})

test('fork package mounts distinct host and browser entry points',async()=>{
  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'))
  const patch=await readFile(new URL('../cordis.patch.yml',import.meta.url),'utf8')
  assert.equal(pkg.name,'@ihab-zhaika/dsh-darkingdoom')
  assert.equal(pkg.exports['.'].default,'./lib/captain.js')
  assert.match(patch,/id: darkingdoom/)
  assert.doesNotMatch(patch,/id: agent-teams/)
  assert.equal(pkg.peerDependencies['@deepseek-ai/dsh-agent'],'0.2.0-rc.2')
})
