import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'
import ts from 'typescript'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { transform } from 'lightningcss'
import { createServer } from 'node:http'
import TestRenderer, { act } from 'react-test-renderer'

const root = fileURLToPath(new URL('../', import.meta.url))
const folder = await mkdtemp(join(root, '.captain-ui-test-'))
let ui, entry
try {
  const source = (await readFile(join(root, 'src/client/CaptainPanel.tsx'), 'utf8')).replace(/import css from '[^']+'/, 'const css = {}')
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const file = join(folder, 'panel.mjs')
  await writeFile(file, compiled)
  ui = await import(pathToFileURL(file).href)
  const entrySource = (await readFile(join(root, 'src/client/captain-index.tsx'), 'utf8'))
    .replace(/import css from '[^']+'/, 'const css = {}')
    .replace('./CaptainPanel.tsx', './panel.mjs')
    .replace('./session-navigation.ts', pathToFileURL(join(root, 'src/client/session-navigation.ts')).href)
  const entryFile = join(folder, 'entry.mjs')
  await writeFile(entryFile, ts.transpileModule(entrySource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText)
  entry = await import(pathToFileURL(entryFile).href)
} finally { await rm(folder, { recursive: true, force: true }) }

test('elapsed time freezes at task completion and rejects invalid timestamps', () => {
  assert.equal(ui.elapsedMs('2026-01-01T00:00:00Z', '2026-01-01T00:01:00Z', Date.parse('2026-01-01T01:00:00Z')), 60000)
  assert.equal(ui.elapsedMs('invalid', undefined, Date.now()), 0)
  assert.equal(ui.elapsedMs('2026-01-01T01:00:00Z', undefined, Date.parse('2026-01-01T00:00:00Z')), 0)
})

async function withPollingPanel(fn,coordinator=false,{deferFirst=false,controlPass=false,policyPass=false,status='running',runConfig={},taskPatch={},failFirst=true,idle=false,nativeEvidence={host:'test-host',workers:[]}}={}) {
  const startedAt=new Date().toISOString(),ticket={id:'7',title:'Own ticket',milestone:'M1',url:'',predecessors:[]}
  const task={id:'task',sessionId:'worker',ticket,status:'running',phase:'implementation',startedAt,phases:[],followups:[],reviewRounds:0,...taskPatch}
  const config={provider:'github',repository:'owner/repo',workspace:'C:/repo',remote:'origin',targetBranch:'main',milestones:['M1'],parallelism:2,maxTeamMembers:3,maxTickets:0,pollSeconds:30,maxRepairRounds:3,maxTaskMinutes:120,verifyCommands:['test'],workerPreset:'standard',requireMemory:false,requireBrowser:false,...runConfig}
  const run={id:'run',captainSessionId:'coordinator',status,config,tasks:[task],tickets:[ticket],questions:[],createdAt:startedAt}
  const snapshot={run:idle?null:run,role:idle?'idle':coordinator?'coordinator':'worker',coordinatorSessionId:'coordinator'}
  let requests=0,renderer,firstResponse
  const policyRequests=[]
  const configurationRequests=[]
  const controlRequests=[]
  const resumeRequests=[]
  const evidenceRequests=[]
  const server=createServer((req,res)=>{
    if(req.url.startsWith('/api/darkingdoom/state')) {
      if(++requests===1&&failFirst){if(deferFirst){firstResponse=res;return};res.writeHead(404,{'content-type':'text/plain'});res.end('Not Found')}
      else{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(snapshot))}
    }else if(req.url.startsWith('/api/darkingdoom/context')){
      res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({config,providers:['github'],warnings:[],milestoneSource:'',verificationSource:'',milestoneCatalog:config.milestones}))
    }else if(req.url==='/api/darkingdoom/start'||req.url==='/api/darkingdoom/configure'){
      let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{
        const value=JSON.parse(body);configurationRequests.push({url:req.url,...value});run.config=value.config;snapshot.run=run;snapshot.role='coordinator'
        res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({run}))
      })
    }else if(req.url==='/api/darkingdoom/policy'){
      let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{
        const policy=JSON.parse(body);policyRequests.push(policy)
        if(policyPass){const {sessionId,...patch}=policy;Object.assign(config,patch)}
        res.writeHead(policyPass?200:409,{'content-type':'application/json'});res.end(JSON.stringify(policyPass?{run}:{error:'Policy rejected by lifecycle guard'}))
      })
    }else if(req.url==='/api/darkingdoom/control'){
      let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{
        const value=JSON.parse(body);controlRequests.push(value)
        if(controlPass&&['finish-existing','allow-new-tickets'].includes(value.action))run.intakeMode=value.action==='finish-existing'?'existing-only':'new-tickets'
        res.writeHead(controlPass?200:409,{'content-type':'application/json'});res.end(JSON.stringify(controlPass?{run}:{error:'Control rejected by lifecycle guard'}))
      })
    }else if(req.url==='/api/darkingdoom/resume-task'){
      let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{resumeRequests.push(JSON.parse(body));res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({task}))})
    }else if(req.url.startsWith('/api/darkingdoom/evidence')){
      evidenceRequests.push(req.url);res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(nativeEvidence))
    }else{res.writeHead(controlPass?200:409,{'content-type':'application/json'});res.end(JSON.stringify(controlPass?{run}:{error:'Control rejected by lifecycle guard'}))}
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const originalFetch=globalThis.fetch,origin=`http://127.0.0.1:${server.address().port}`
  globalThis.fetch=(url,options)=>originalFetch(new URL(url,origin),options)
  const settle=async(ms=150)=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,ms))})
  try {
    await act(async()=>{renderer=TestRenderer.create(createElement(ui.CaptainPanel,{sessionId:coordinator?'coordinator':'worker',onClose(){},openSession:async()=>{},initialSnapshot:snapshot}))})
    await settle()
    await fn({renderer,settle,text:()=>JSON.stringify(renderer.toJSON()),requests:()=>requests,policyRequests,configurationRequests,controlRequests,resumeRequests,evidenceRequests,failFirst:()=>{assert.ok(firstResponse);firstResponse.writeHead(404,{'content-type':'text/plain'});firstResponse.end('Not Found')}})
  }finally{
    if(renderer)await act(async()=>renderer.unmount())
    globalThis.fetch=originalFetch;server.closeAllConnections();await new Promise(resolve=>server.close(resolve))
  }
}

test('new runs enable unmilestoned tickets and required predecessors with a million-token review budget',()=>{
  const html=renderToStaticMarkup(createElement(ui.CaptainPanel,{sessionId:'main',onClose(){},openSession:async()=>{}}))
  assert.match(html,/checked=""\/>Include tickets without a milestone/)
  assert.match(html,/checked=""\/>Include required predecessors outside the selected milestones/)
  assert.match(html,/Token budget per independent review session<input[^>]*value="1000000"/)
  assert.match(html,/Each review has its own budget; no shared pool across workers or the run/)
  assert.match(html,/Milestone order sets priority; dependencies still gate dispatch/)
})

test('milestone-free new and stopped configurations can submit with unmilestoned intake enabled',async()=>{
  for(const idle of [true,false])await withPollingPanel(async p=>{
    const milestoneInput=()=>p.renderer.root.findAllByType('label').find(label=>label.children.includes('Milestones, in priority order')).findByType('textarea')
    const submit=()=>p.renderer.root.findByProps({type:'submit'})
    const intake=()=>p.renderer.root.findAllByType('input').find(input=>input.props.type==='checkbox'&&!input.props['aria-label'])
    assert.equal(milestoneInput().props.required,false)
    assert.equal(submit().props.disabled,false)
    await act(async()=>intake().props.onChange({target:{checked:false}}))
    assert.equal(milestoneInput().props.required,true)
    assert.equal(submit().props.disabled,true)
    await act(async()=>intake().props.onChange({target:{checked:true}}))
    await act(async()=>p.renderer.root.findAllByType('form')[0].props.onSubmit({preventDefault(){}}))
    await p.settle()
    assert.equal(p.configurationRequests.length,1)
    assert.equal(p.configurationRequests[0].url,idle?'/api/darkingdoom/start':'/api/darkingdoom/configure')
    assert.deepEqual(p.configurationRequests[0].config.milestones,[])
    assert.equal(p.configurationRequests[0].config.includeUnmilestoned,true)
  },true,{idle,status:'stopped',failFirst:false,runConfig:{milestones:[],includeUnmilestoned:true}})
})

test('review budget inputs and live policy submission enforce the ten-million-token cap',()=>withPollingPanel(async p=>{
  const live=()=>p.renderer.root.findByProps({'aria-label':'Live OCR token budget'})
  const apply=()=>p.renderer.root.findAllByType('button').find(button=>button.children.includes('Apply policy'))
  for(const input of p.renderer.root.findAllByType('input').filter(input=>input.props.max>100000))assert.equal(input.props.max,10_000_000)
  await act(async()=>live().props.onChange({target:{value:'10000001'}}))
  assert.equal(apply().props.disabled,true)
  await act(async()=>apply().props.onClick())
  await p.settle();assert.equal(p.policyRequests.length,0)
  await act(async()=>live().props.onChange({target:{value:'10000000'}}))
  assert.equal(apply().props.disabled,false)
  await act(async()=>apply().props.onClick())
  await p.settle();assert.equal(p.policyRequests[0].ocrMaxTokensBudget,10_000_000)
},true,{policyPass:true,failFirst:false}))

test('legacy runs display disabled intake extensions and the default review budget',()=>{
  const run={id:'run',captainSessionId:'main',status:'running',config:{parallelism:2},tasks:[],tickets:[],questions:[],createdAt:new Date().toISOString()}
  const html=renderToStaticMarkup(createElement(ui.CaptainPanel,{sessionId:'main',onClose(){},openSession:async()=>{},initialSnapshot:{run,role:'coordinator'}}))
  assert.doesNotMatch(html,/checked=""\/>Include (tickets without a milestone|required predecessors)/)
  assert.match(html,/aria-label="Live OCR token budget"[^>]*value="1000000"/)
})

test('live intake policy preserves a draft across polling and posts all policy values',()=>withPollingPanel(async p=>{
  const live=label=>p.renderer.root.findByProps({'aria-label':label})
  await act(async()=>live('Live include tickets without a milestone').props.onChange({target:{checked:true}}))
  await act(async()=>live('Live include required predecessors outside the selected milestones').props.onChange({target:{checked:true}}))
  await act(async()=>live('Live OCR token budget').props.onChange({target:{value:'250000'}}))
  await p.settle(3100)
  assert.equal(live('Live include tickets without a milestone').props.checked,true)
  assert.equal(live('Live OCR token budget').props.value,250000)
  await act(async()=>p.renderer.root.findAllByType('button').find(b=>b.children.includes('Apply policy')).props.onClick())
  await p.settle()
  assert.deepEqual(p.policyRequests,[{sessionId:'coordinator',includeUnmilestoned:true,includeRequiredPredecessors:true,ocrMaxTokensBudget:250000,reviewBackend:'ocr',ocrAdditionalCheck:false}])
  assert.match(p.text(),/Policy saved/)
},true,{policyPass:true}))

test('live policy accepts changes while paused and remains disabled while draining',async()=>{
  for(const status of ['paused','draining'])await withPollingPanel(async p=>{
    const budget=p.renderer.root.findByProps({'aria-label':'Live OCR token budget'})
    assert.equal(budget.props.disabled,status==='draining')
    const button=p.renderer.root.findAllByType('button').find(b=>b.children.includes('Apply policy'))
    assert.equal(button.props.disabled,status==='draining')
  },true,{status})
})

test('poll recovery cannot hide a failed live policy update',()=>withPollingPanel(async p=>{
  await act(async()=>p.renderer.root.findAllByType('button').find(b=>b.children.includes('Apply policy')).props.onClick())
  await p.settle();assert.match(p.text(),/POST \/api\/darkingdoom\/policy/);assert.match(p.text(),/Policy rejected by lifecycle guard/)
  await p.settle(3100);assert.match(p.text(),/Policy rejected by lifecycle guard/)
},true))

test('required predecessor scope and unassigned milestones appear in the dependency graph',()=>{
  const tickets=[{id:'1',title:'Selected',milestone:'M1',predecessors:['2']},{id:'2',title:'Required',milestone:'',predecessors:[]}]
  const html=renderToStaticMarkup(createElement(ui.CaptainEligibilityGraph,{tickets,rows:[{ticketId:'2',eligible:true,reason:'Ready',scope:'predecessor',requiredFor:['1','3']}]}))
  assert.match(html,/Required by #1, #3/);assert.match(html,/Unassigned/)
})

test('a worker panel clears a transient refresh 404 after the next successful poll',()=>withPollingPanel(async p=>{
  assert.match(p.text(),/404/);assert.match(p.text(),/Own ticket/)
  await p.settle(3100)
  assert.ok(p.requests()>=2);assert.doesNotMatch(p.text(),/404/);assert.match(p.text(),/Own ticket/)
}))

test('poll recovery cannot hide a failed coordinator action',()=>withPollingPanel(async p=>{
  await act(async()=>p.renderer.root.findAllByType('button').find(b=>b.children.includes('Monitor')).props.onClick())
  await act(async()=>p.renderer.root.findAllByType('button').find(b=>b.children.includes('Stop')).props.onClick())
  await p.settle();assert.match(p.text(),/Control rejected by lifecycle guard/)
  await p.settle(3100);assert.ok(p.requests()>=2);assert.match(p.text(),/Control rejected by lifecycle guard/)
},true))

test('request errors identify the failed method and plugin endpoint',()=>withPollingPanel(async p=>{
  assert.match(p.text(),/GET \/api\/darkingdoom\/state/)
}))

test('an old delayed refresh 404 cannot replace a newer healthy snapshot',()=>withPollingPanel(async p=>{
  await act(async()=>p.renderer.root.findAllByType('button').find(b=>b.children.includes('Monitor')).props.onClick())
  await act(async()=>p.renderer.root.findAllByType('button').find(b=>b.children.includes('Apply')).props.onClick())
  await p.settle();assert.ok(p.requests()>=2);assert.doesNotMatch(p.text(),/404/)
  p.failFirst();await p.settle();assert.doesNotMatch(p.text(),/404/)
},true,{deferFirst:true,controlPass:true}))

test('repository identity fields belong to the session and stay read-only', () => {
  const html = renderToStaticMarkup(createElement(ui.CaptainPanel, {sessionId:'repo-session', workspace:'C:/repo', onClose(){}, openSession:async()=>{}}))
  for (const name of ['Repository','Workspace','Remote','Target branch']) {
    assert.match(html, new RegExp(`${name}<input[^>]+readOnly`, 'i'))
  }
  assert.match(html,/Loading repository configuration/)
})

test('worker panel shows origin and own phase totals without coordinator controls',()=>{
  const task={id:'task',sessionId:'worker',ticket:{id:'7',title:'Own ticket',milestone:'M1',url:'',predecessors:[]},status:'parked',phase:'parked',startedAt:'2026-01-01T00:00:00Z',phases:[{phase:'implementation',at:'2026-01-01T00:00:00Z'},{phase:'parked',at:'2026-01-01T00:01:00Z'}],followups:[],reviewRounds:0}
  const run={id:'run',captainSessionId:'coordinator',status:'running',config:{parallelism:2,milestones:['M1']},tasks:[task],questions:[],tickets:[task.ticket]}
  const html=renderToStaticMarkup(createElement(ui.CaptainPanel,{sessionId:'worker',onClose(){},openSession:async()=>{},initialSnapshot:{role:'worker',run,coordinatorSessionId:'coordinator'}}))
  assert.match(html,/Initiated by coordination session/);assert.match(html,/coordinator/);assert.match(html,/Phase timeline/);assert.match(html,/parked/)
  assert.doesNotMatch(html,/aria-label="Run controls"|Run configuration|Live parallelism|Delivery queue|Start DarKingDoom/)
})

test('coordinator headline counts failed tickets instead of hiding them from blocked and parked totals',async()=>withPollingPanel(async p=>{
  const summary=p.renderer.root.findAllByType('small').find(node=>node.children.join('').includes('blocked ·'))
  assert.ok(summary)
  assert.equal(summary.children.join(''),'0 merged · 0 blocked · 1 failed · 0 parked')
},true,{failFirst:false,taskPatch:{status:'failed',phase:'blocked',error:'Task time budget exhausted',finishedAt:new Date().toISOString()}}))

test('only a time-budget-failed task exposes a bounded human continuation in the coordinator panel',async()=>{
  for(const [coordinator,error] of [[true,'Task time budget exhausted'],[true,'CI checks failed'],[false,'Task time budget exhausted']])await withPollingPanel(async p=>{
    if(coordinator)await act(async()=>p.renderer.root.findAllByType('button').find(button=>button.findAllByType('strong').some(s=>s.children.includes('Own ticket'))).props.onClick())
    if(!coordinator||error!=='Task time budget exhausted'){assert.doesNotMatch(p.text(),/Authorize one new bounded window/);return}
    assert.match(p.text(),/Authorize one new bounded window/);assert.match(p.text(),/480 minutes/)
    const input=p.renderer.root.findAllByType('textarea').find(input=>input.parent.children.includes('Reason to retry (for example, solved)'))
    await act(async()=>input.props.onChange({target:{value:'Human approved one window'}}))
    await act(async()=>p.renderer.root.findAllByType('form').find(form=>form.findAllByType('button').some(button=>button.children.includes('Authorize one new bounded window'))).props.onSubmit({preventDefault(){}}))
    await p.settle();assert.deepEqual(p.resumeRequests,[{sessionId:'coordinator',taskId:'task',evidence:'Human approved one window'}]);assert.equal(p.configurationRequests.length,0)
  },coordinator,{failFirst:false,taskPatch:{status:'failed',phase:'blocked',error,finishedAt:new Date().toISOString(),assignmentConfig:{maxTaskMinutes:480}}})
})

test('existing coordinator run shows native loop state and an activation control without another run Start',()=>{
  const run={id:'run',captainSessionId:'main',status:'running',config:{parallelism:2},tasks:[],tickets:[],questions:[],createdAt:new Date().toISOString()}
  const props={sessionId:'main',onClose(){},openSession:async()=>{}}
  const stopped=renderToStaticMarkup(createElement(ui.CaptainPanel,{...props,initialSnapshot:{run,role:'coordinator',coordinatorLoop:{status:'not-started'}}}))
  assert.match(stopped,/Start coordinator loop/);assert.match(stopped,/Run already created/)
  const active=renderToStaticMarkup(createElement(ui.CaptainPanel,{...props,initialSnapshot:{run,role:'coordinator',coordinatorLoop:{status:'active',activation:'armed',roundsStarted:3,maxGoalRounds:256}}}))
  assert.match(active,/Coordinator loop: active/);assert.match(active,/3 \/ 256 rounds/);assert.doesNotMatch(active,/Start coordinator loop/)
})

test('monitor separates reserved task slots from live execution and exposes queued idle roots on demand',async()=>withPollingPanel(async p=>{
  assert.match(p.text(),/Reserved task slots \/ parallel limit/)
  assert.match(p.text(),/not proof of a live model stream/i)
  const inspect=p.renderer.root.findAllByType('button').find(button=>button.children.includes('Inspect native activity'))
  assert.ok(inspect)
  await act(async()=>inspect.props.onClick());await p.settle()
  assert.equal(p.evidenceRequests.length,1)
  assert.equal(p.evidenceRequests[0],'/api/darkingdoom/evidence?sessionId=coordinator')
  assert.match(p.text(),/Native execution evidence/)
  assert.match(p.text(),/PID 70920/)
  assert.match(p.text(),/module abcdef012345/)
  assert.match(p.text(),/source 123456789abc/)
  assert.doesNotMatch(p.text(),/private\/plugin/)
  const nativeText=p.renderer.root.findAllByType('p').map(node=>node.children.join(' ')).filter(text=>/Root idle/.test(text)).join('\n')
  assert.match(nativeText,/Root idle · 0 queued next-turn messages · 3 queued next-step messages/,nativeText)
  assert.match(p.text(),/queued input is not proof of a running model stream/i)
  const reservation=p.renderer.root.findAllByType('small').map(node=>node.children.join(' ').replace(/\s+/g,' ').trim()).find(text=>text.includes('Execution reservation'))
  assert.equal(reservation,'Execution reservation: owned activity or pending input observed')
  assert.doesNotMatch(p.text(),/queued secret prompt/)
},true,{failFirst:false,nativeEvidence:{host:{loadedAt:'2026-10-14T12:00:00.000Z',pid:70920,moduleUrl:'file:///C:/private/plugin/runtime.js',moduleSha256:'abcdef0123456789abcdef0123456789',build:{schema:1,source:'123456789abcdef0',output:'987654321abcdef0'}},workers:[{taskId:'task',sessionId:'worker',lifecycle:{available:true,status:'idle',observedAt:'2026-10-14T12:00:00.000Z',inbox:{readable:true,nextTurn:0,nextStep:3,content:'queued secret prompt'}},execution:{active:true,observedAt:'2026-10-14T12:00:00.000Z'},coordination:{status:'running',phase:'waiting',unfinishedTeamTasks:2}}]}}))

test('eligibility graph lays out prerequisites before dependents and retains missing/cyclic nodes',()=>{
  const graph=ui.eligibilityGraph([{id:'1',title:'child',predecessors:['2']},{id:'2',title:'root',predecessors:[]},{id:'3',title:'missing',predecessors:['9']},{id:'4',title:'cycle',predecessors:['5']},{id:'5',title:'cycle',predecessors:['4']}])
  const node=id=>graph.nodes.find(n=>n.id===id)
  assert.ok(node('2').x<node('1').x);assert.equal(node('9').missing,true);assert.equal(graph.edges.length,4)
  assert.ok(graph.nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)))
})

test('resolved review failures remain historical and are not presented as the current gate',()=>{
  const task={id:'task',ticket:{id:'7'},status:'merged',headSha:'head',reviewHistory:[{passed:false,headSha:'',at:'2026-01-01',report:'Original AgentTeams creation evidence is missing',findings:['Missing evidence']},{passed:true,headSha:'head',at:'2026-01-02',report:'Complete',findings:[]}]}
  const html=renderToStaticMarkup(createElement(ui.CaptainReviewEvidence,{task}))
  assert.match(html,/Current gate passed/);assert.match(html,/Historical failure/);assert.match(html,/Unavailable/)
})

test('worker session links use ordinary root session navigation on current and legacy hosts', async () => {
  for (const modern of [true, false]) {
    const slots = new Map(), opened = [], panels = [], definitions = [], sidebarOpens = []
    const workspace = modern ? { openSession: target => opened.push(target) } : undefined
    const sessions = { list: { getSnapshot: () => ({ byId: {} }) }, ...(modern ? {} : { open: target => opened.push(target) }), refreshSubagents() { assert.fail('Root workers must not use the subagent catalog') }, openSubagent() { assert.fail('Root workers must not use addressed subagent navigation') } }
    entry.apply({ sessions, layout: { selectPanel: panel => panels.push(panel) }, sidebarRight: { openTab: kind => sidebarOpens.push(kind) }, sidebarRightTabs: {register(definition){definitions.push(definition);return()=>{}}}, effect:create=>create(), get: name => name === 'uiWorkspace' ? workspace : undefined, slots: { inject(_name, callback) { callback() }, register(options, component) { slots.set(options.name, component); return () => {} } } })
    assert.equal(slots.has('shell.overlay'),false)
    assert.equal(definitions.length,1)
    assert.equal(definitions[0].kind,'darkingdoom')
    assert.equal(definitions[0].keepMounted,true)
    assert.equal(definitions[0].guide[0].title(),'DarKingDoom Plugin')
    const button = slots.get('conversation.session.header.actions')({sessionId:'captain-parent'})
    button.props.onClick()
    assert.deepEqual(sidebarOpens,['darkingdoom'])
    const surface = slots.get('sidebar.right.pane.tab')({sessionId:'captain-parent',useTabInfo:()=>({tab:{actions:{close(){}}}})})
    assert.equal(surface.props.sessionId,'captain-parent')
    await surface.props.openSession('captain-parent', 'ordinary-worker')
    assert.deepEqual(opened, ['ordinary-worker'])
    assert.deepEqual(panels, [null])
  }
})

test('phase duration includes repeat repair rounds and freezes terminal phases', () => {
  const task = { startedAt: '2026-01-01T00:00:00Z', finishedAt: '2026-01-01T00:05:00Z', phases: [
    { phase: 'implementation', at: '2026-01-01T00:00:00Z' },
    { phase: 'review', at: '2026-01-01T00:01:00Z' },
    { phase: 'repair', at: '2026-01-01T00:02:00Z' },
    { phase: 'review', at: '2026-01-01T00:04:00Z' },
  ] }
  assert.deepEqual(ui.phaseDurations(task, Date.parse('2026-01-01T01:00:00Z')), [
    { phase: 'implementation', milliseconds: 60000 }, { phase: 'review', milliseconds: 120000 }, { phase: 'repair', milliseconds: 120000 },
  ])
})

test('out of order or invalid phase events never produce negative durations', () => {
  const task = { phases: [{ phase: 'review', at: '2026-01-01T00:01:00Z' }, { phase: 'analysis', at: '2026-01-01T00:00:00Z' }, { phase: 'repair', at: 'invalid' }] }
  assert.deepEqual(ui.phaseDurations(task, Date.parse('2026-01-01T00:02:00Z')), [
    { phase: 'analysis', milliseconds: 60000 }, { phase: 'review', milliseconds: 60000 },
  ])
})

test('external links accept only web URLs', () => {
  assert.equal(ui.webUrl('javascript:alert(1)'), undefined)
  assert.equal(ui.webUrl('https://github.com/acme/app/pull/1'), 'https://github.com/acme/app/pull/1')
})

test('initial dashboard makes authorization explicit and prevents starting before state loads', () => {
  const html = renderToStaticMarkup(createElement(ui.CaptainPanel, { sessionId: 'captain-one', workspace: 'C:/repo', onClose() {}, openSession: async () => {} }))
  assert.match(html, /role="region" aria-labelledby="darkingdoom-title"/)
  assert.doesNotMatch(html, /role="dialog"|aria-modal/)
  assert.match(html,/aria-label="Plugin view"/)
  assert.match(html,/>Configuration<\/button>/)
  assert.match(html,/>Monitor<\/button>/)
  assert.match(html, /value="C:\/repo"/)
  assert.match(html, /disabled="">Start DarKingDoom Plugin/)
  assert.match(html, /Start enables the native coordinator loop in this chat/)
  assert.match(html, /authorizes full access execution, autonomous repair, review, merge and ticket closure/)
  assert.match(html, /Active agent effort/)
  assert.match(html, /Not measured/)
  assert.match(html, /Opening this panel never starts a run/)
})

test('dashboard CSS compiles with production CSS module transformer', async () => {
  const code = await readFile(join(root, 'src/client/CaptainPanel.module.css'))
  const result = transform({ filename: 'CaptainPanel.module.css', code, cssModules: true, errorRecovery: false })
  assert.ok(result.code.length > 0)
  assert.ok(result.exports.panel)
})

test('stopped runs can resume but cannot start a replacement run', () => {
  assert.deepEqual(ui.captainActionAvailability('stopped', true, false), { start: false, pause: false, resume: true, drain: false, stop: false, parallelism: false })
  assert.equal(ui.captainActionAvailability(undefined, true, false).start, true)
  assert.equal(ui.captainActionAvailability(undefined, false, false).start, false)
  for (const status of ['running', 'paused', 'draining', 'stopped']) {
    assert.equal(ui.captainActionAvailability(status, true, false).start, false)
    assert.ok(Object.values(ui.captainActionAvailability(status, true, true)).every(value => value === false))
  }
})

test('stopped coordinator configuration is editable with Save and explicit visible ticket selection',()=>{
  const run={id:'run',captainSessionId:'main',status:'stopped',config:{parallelism:2},tasks:[],tickets:[],questions:[],createdAt:new Date().toISOString()}
  const html=renderToStaticMarkup(createElement(ui.CaptainPanel,{sessionId:'main',onClose(){},openSession:async()=>{},initialSnapshot:{run,role:'coordinator'}}))
  assert.doesNotMatch(html,/<fieldset disabled/);assert.match(html,/Save configuration/);assert.match(html,/Ticket IDs/)
  assert.equal(ui.configurationEditable('stopped',true,false,false),true)
  for(const status of ['running','paused','draining'])assert.equal(ui.configurationEditable(status,true,false,false),false)
  assert.equal(ui.configurationEditable('stopped',true,false,true),false)
})

test('clean stopped drafts hydrate same-run server changes while dirty drafts survive polling',()=>{
  assert.equal(ui.shouldHydrateConfiguration('run','run',false,'parallelism2','parallelism5'),true)
  assert.equal(ui.shouldHydrateConfiguration('run','run',true,'parallelism2','parallelism5'),false)
  assert.equal(ui.shouldHydrateConfiguration('run','run',false,'parallelism5','parallelism5'),false)
  assert.equal(ui.shouldHydrateConfiguration('old','new',true,'old','new'),true)
})

test('ticket selection parses on submission, preserving free-form delimiters while typing',()=>{
  assert.deepEqual(ui.parseTicketSelection('1, 2\n3'),['1','2','3'])
  assert.equal(ui.parseTicketSelection(' , \n'),undefined)
  assert.deepEqual(ui.parseTicketSelection('1,1'),['1','1']) // Validation must reject duplicates; never silently change scope.
})

test('review history exposes commit, findings, safe text excerpt and downloadable evidence', () => {
  const task = { id: 'task-1', ticket: { id: '42' }, reviewHistory: [{ at: '2026-01-01T00:00:00Z', passed: false, headSha: 'abcdef', findings: ['Fix escaping'], report: '<script>alert(1)</script>' }] }
  const html = renderToStaticMarkup(createElement(ui.CaptainReviewEvidence, { task }))
  assert.match(html, /1 finding/)
  assert.match(html, /abcdef/)
  assert.match(html, /Fix escaping/)
  assert.match(html, /Download JSON/)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.doesNotMatch(html, /<script>/)
  assert.deepEqual(JSON.parse(ui.reviewExport(task, task.reviewHistory[0])), { taskId: 'task-1', ticketId: '42', at: '2026-01-01T00:00:00Z', passed: false, headSha: 'abcdef', findings: ['Fix escaping'], report: '<script>alert(1)</script>' })
  const structured = JSON.parse(ui.reviewExport(task, { ...task.reviewHistory[0], report: '{"manifest":{"schema_version":"ocr.run-manifest/v1"}}' }))
  assert.equal(structured.report.manifest.schema_version, 'ocr.run-manifest/v1')
})

test('coordinator can close new intake while keeping existing recovery and explicitly reopen later',()=>withPollingPanel(async p=>{
 await act(async()=>p.renderer.root.findAllByType('button').find(b=>b.children.includes('Monitor')).props.onClick())
 await act(async()=>p.renderer.root.findAllByType('button').find(b=>b.children.includes('Finish existing tasks')).props.onClick());await p.settle()
 assert.deepEqual(p.controlRequests,[{sessionId:'coordinator',action:'finish-existing'}]);assert.match(p.text(),/Existing tasks only/)
 await act(async()=>p.renderer.root.findAllByType('button').find(b=>b.children.includes('Allow new tickets')).props.onClick());await p.settle()
 assert.deepEqual(p.controlRequests[1],{sessionId:'coordinator',action:'allow-new-tickets'});assert.doesNotMatch(p.text(),/Existing tasks only:/)
},true,{controlPass:true,failFirst:false}))

test('primary agent review and optional OCR are explicit live policy choices',()=>withPollingPanel(async p=>{
 const select=p.renderer.root.findByProps({'aria-label':'Live primary review backend'})
 await act(async()=>select.props.onChange({target:{value:'agent'}}))
 await act(async()=>p.renderer.root.findByProps({'aria-label':'Live optional OCR check'}).props.onChange({target:{checked:false}}))
 await act(async()=>p.renderer.root.findAllByType('button').find(b=>b.children.includes('Apply policy')).props.onClick());await p.settle()
 assert.equal(p.policyRequests[0].reviewBackend,'agent');assert.equal(p.policyRequests[0].ocrAdditionalCheck,false);assert.equal(p.policyRequests[0].ocrMaxTokensBudget,1_000_000)
},true,{policyPass:true,failFirst:false}))
