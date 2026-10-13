import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
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

test('fork package mounts distinct host and browser entry points',async()=>{
  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'))
  const patch=await readFile(new URL('../cordis.patch.yml',import.meta.url),'utf8')
  assert.equal(pkg.name,'@ihab-zhaika/dsh-darkingdoom')
  assert.equal(pkg.exports['.'].default,'./lib/captain.js')
  assert.match(patch,/id: darkingdoom/)
  assert.doesNotMatch(patch,/id: agent-teams/)
  assert.equal(pkg.peerDependencies['@deepseek-ai/dsh-agent'],'0.2.0-rc.2')
})
