import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'
import ts from 'typescript'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { transform } from 'lightningcss'

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

test('worker session links use ordinary root session navigation on current and legacy hosts', async () => {
  for (const modern of [true, false]) {
    const slots = new Map(), opened = [], panels = []
    const workspace = modern ? { openSession: target => opened.push(target) } : undefined
    const sessions = { list: { getSnapshot: () => ({ byId: {} }) }, ...(modern ? {} : { open: target => opened.push(target) }), refreshSubagents() { assert.fail('Root workers must not use the subagent catalog') }, openSubagent() { assert.fail('Root workers must not use addressed subagent navigation') } }
    entry.apply({ sessions, layout: { selectPanel: panel => panels.push(panel) }, get: name => name === 'uiWorkspace' ? workspace : undefined, slots: { inject(_name, callback) { callback() }, register(options, component) { slots.set(options.name, component); return () => {} } } })
    const surface = slots.get('shell.overlay')()
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
  assert.match(html, /role="dialog" aria-modal="true"/)
  assert.match(html, /value="C:\/repo"/)
  assert.match(html, /disabled="">Start Delivery Captain/)
  assert.match(html, /Start authorizes full access execution, autonomous repair, review, merge and ticket closure/)
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
