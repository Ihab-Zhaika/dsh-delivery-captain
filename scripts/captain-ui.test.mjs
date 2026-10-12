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

async function withPollingPanel(fn,coordinator=false,{deferFirst=false,controlPass=false}={}) {
  const startedAt=new Date().toISOString(),ticket={id:'7',title:'Own ticket',milestone:'M1',url:'',predecessors:[]}
  const task={id:'task',sessionId:'worker',ticket,status:'running',phase:'implementation',startedAt,phases:[],followups:[],reviewRounds:0}
  const config={provider:'github',repository:'owner/repo',workspace:'C:/repo',remote:'origin',targetBranch:'main',milestones:['M1'],parallelism:2,maxTeamMembers:3,maxTickets:0,pollSeconds:30,maxRepairRounds:3,maxTaskMinutes:120,verifyCommands:['test'],workerPreset:'standard',requireMemory:false,requireBrowser:false}
  const run={id:'run',captainSessionId:'coordinator',status:'running',config,tasks:[task],tickets:[ticket],questions:[],createdAt:startedAt}
  const snapshot={run,role:coordinator?'coordinator':'worker',coordinatorSessionId:'coordinator'}
  let requests=0,renderer,firstResponse
  const server=createServer((req,res)=>{
    if(req.url.startsWith('/api/darkingdoom/state')) {
      if(++requests===1){if(deferFirst){firstResponse=res;return};res.writeHead(404,{'content-type':'text/plain'});res.end('Not Found')}
      else{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(snapshot))}
    }else{res.writeHead(controlPass?200:409,{'content-type':'application/json'});res.end(JSON.stringify(controlPass?{run}:{error:'Control rejected by lifecycle guard'}))}
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const originalFetch=globalThis.fetch,origin=`http://127.0.0.1:${server.address().port}`
  globalThis.fetch=(url,options)=>originalFetch(new URL(url,origin),options)
  const settle=async(ms=150)=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,ms))})
  try {
    await act(async()=>{renderer=TestRenderer.create(createElement(ui.CaptainPanel,{sessionId:coordinator?'coordinator':'worker',onClose(){},openSession:async()=>{},initialSnapshot:snapshot}))})
    await settle()
    await fn({renderer,settle,text:()=>JSON.stringify(renderer.toJSON()),requests:()=>requests,failFirst:()=>{assert.ok(firstResponse);firstResponse.writeHead(404,{'content-type':'text/plain'});firstResponse.end('Not Found')}})
  }finally{
    if(renderer)await act(async()=>renderer.unmount())
    globalThis.fetch=originalFetch;server.closeAllConnections();await new Promise(resolve=>server.close(resolve))
  }
}

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

test('existing coordinator run shows native loop state and an activation control without another run Start',()=>{
  const run={id:'run',captainSessionId:'main',status:'running',config:{parallelism:2},tasks:[],tickets:[],questions:[],createdAt:new Date().toISOString()}
  const props={sessionId:'main',onClose(){},openSession:async()=>{}}
  const stopped=renderToStaticMarkup(createElement(ui.CaptainPanel,{...props,initialSnapshot:{run,role:'coordinator',coordinatorLoop:{status:'not-started'}}}))
  assert.match(stopped,/Start coordinator loop/);assert.match(stopped,/Run already created/)
  const active=renderToStaticMarkup(createElement(ui.CaptainPanel,{...props,initialSnapshot:{run,role:'coordinator',coordinatorLoop:{status:'active',activation:'armed',roundsStarted:3,maxGoalRounds:256}}}))
  assert.match(active,/Coordinator loop: active/);assert.match(active,/3 \/ 256 rounds/);assert.doesNotMatch(active,/Start coordinator loop/)
})

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
