/** Browser-only DarKingDoom Plugin surface. Mounting never enables automation. */
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import type { Phase, Run, RunConfig, Task, RepositoryContext } from '../captain/types.ts'
import css from './CaptainPanel.module.css'

export const CAPTAIN_OPEN_EVENT = 'darkingdoom:open'
export interface CaptainOpenDetail { sessionId: string; workspace?: string }
interface Eligibility { ticketId: string; eligible: boolean; reason: string }
interface Snapshot { run: Run | null; eligibility?: Eligibility[] }
type Action = 'pause' | 'resume' | 'drain' | 'stop' | 'parallelism'
type ReviewEvidence = NonNullable<Task['reviewHistory']>[number]

/** A stopped run retains its identity and claims; only Resume reactivates it. */
export function captainActionAvailability(status: Run['status'] | undefined, loaded: boolean, busy: boolean) {
  const available = loaded && !busy
  const active = status !== undefined && status !== 'stopped'
  return {
    start: available && status === undefined,
    pause: available && status === 'running',
    resume: available && status !== undefined && status !== 'running',
    drain: available && active && status !== 'draining',
    stop: available && active,
    parallelism: available && active,
  }
}

/** Export data rather than interpreting a report string as a URL or HTML. */
export function reviewExport(task: Pick<Task, 'id' | 'ticket'>, review: ReviewEvidence): string {
  let report: unknown = review.report
  try { report = JSON.parse(review.report) } catch { /* Failed gates may retain plain diagnostic text. */ }
  return JSON.stringify({ taskId: task.id, ticketId: task.ticket.id, at: review.at, passed: review.passed, headSha: review.headSha, findings: review.findings, report }, null, 2)
}

function ReviewEvidenceRow({ task, review, index }: { task: Task; review: ReviewEvidence; index: number }) {
  const [download, setDownload] = useState<string>()
  const payload = reviewExport(task, review)
  useEffect(() => {
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
    setDownload(url)
    return () => URL.revokeObjectURL(url)
  }, [payload])
  const filename = `delivery-review-${task.ticket.id.replace(/[^a-zA-Z0-9_-]/g, '-')}-${index + 1}.json`
  return <article className={css.reviewRecord}>
    <div className={css.reviewHeading}><strong>Review {index + 1}</strong><span className={css.status} data-status={review.passed ? 'ready' : 'failed'}>{review.passed ? 'Passed at review' : 'Failed'}</span><span>{review.findings.length} {review.findings.length === 1 ? 'finding' : 'findings'}</span><a href={download} download={filename} aria-disabled={!download}>Download JSON ↓</a></div>
    <div className={css.reviewMetadata}><time dateTime={review.at}>{new Date(review.at).toLocaleString()}</time><span>Reviewed commit <code>{review.headSha || 'Unavailable'}</code></span></div>
    {review.findings.length > 0 && <ul className={css.findings}>{review.findings.map((finding, findingIndex) => <li key={findingIndex}>{finding}</li>)}</ul>}
    <details><summary>Report excerpt</summary><pre>{review.report ? review.report.slice(0, 4000) : 'No report text was returned.'}</pre>{review.report.length > 4000 && <p className={css.muted}>Showing the first 4,000 characters. Download JSON for the complete report.</p>}</details>
  </article>
}

export function CaptainReviewEvidence({ task }: { task: Task }) {
  return <div className={css.reviewEvidence}><h3>Review evidence</h3><p className={css.muted}>Results describe the recorded commit at review time. Later branch changes require a new review.</p>
    {task.reviewHistory?.length ? task.reviewHistory.map((review, index) => <ReviewEvidenceRow key={`${review.at}-${index}`} task={task} review={review} index={index} />) : <p className={css.placeholder}>No independent review has been recorded yet.</p>}
  </div>
}

export function elapsedMs(start: string, end: string | undefined, now: number): number {
  const value = (end ? Date.parse(end) : now) - Date.parse(start)
  return Number.isFinite(value) ? Math.max(0, value) : 0
}
export function phaseDurations(task: Pick<Task, 'phases' | 'finishedAt'>, now: number): { phase: Phase; milliseconds: number }[] {
  const events = task.phases.filter(event => Number.isFinite(Date.parse(event.at))).slice().sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const totals = new Map<Phase, number>()
  for (const [index, event] of events.entries()) {
    const milliseconds = elapsedMs(event.at, events[index + 1]?.at ?? task.finishedAt, now)
    totals.set(event.phase, (totals.get(event.phase) ?? 0) + milliseconds)
  }
  return Array.from(totals, ([phase, milliseconds]) => ({ phase, milliseconds }))
}
export function webUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined } catch { return undefined }
}
function duration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return minutes < 60 ? `${minutes}m ${seconds % 60}s` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}
function defaults(workspace = ''): RunConfig {
  return { provider: 'github', repository: '', workspace, milestones: [], remote: '', targetBranch: '', parallelism: 2, maxTeamMembers: 4, pollSeconds: 30, maxRepairRounds: 3, maxTaskMinutes: 120, verifyCommands: [], workerPreset: 'standard', requireBrowser: false, requireMemory: false }
}
function lines(value: string): string[] { return value.split(/\r?\n/).map(line => line.trim()).filter(Boolean) }
function terminal(task: Task): boolean { return ['merged', 'failed', 'cancelled'].includes(task.status) }
async function request<T>(url: string, signal: AbortSignal, body?: unknown): Promise<T> {
  const response = await fetch(url, { signal, credentials: 'same-origin', ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) })
  const value: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = value && typeof value === 'object' && 'error' in value ? String(value.error) : response.statusText
    throw new Error(`${response.status}: ${detail || 'DarKingDoom Plugin request failed'}`)
  }
  return value as T
}

export function CaptainSurface({ openSession }: { openSession: (parentId: string, childId: string) => Promise<unknown> }) {
  const [owner, setOwner] = useState<CaptainOpenDetail | null>(null)
  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<CaptainOpenDetail>).detail
      if (detail?.sessionId) setOwner(detail)
    }
    window.addEventListener(CAPTAIN_OPEN_EVENT, open)
    return () => window.removeEventListener(CAPTAIN_OPEN_EVENT, open)
  }, [])
  return owner ? <CaptainPanel key={owner.sessionId} {...owner} onClose={() => setOwner(null)} openSession={openSession} /> : null
}

export function CaptainPanel({ sessionId, workspace, onClose, openSession }: CaptainOpenDetail & { onClose: () => void; openSession: (parentId: string, childId: string) => Promise<unknown> }) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ run: null })
  const [config, setConfig] = useState<RunConfig>(() => defaults(workspace))
  const [milestones, setMilestones] = useState('')
  const [commands, setCommands] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [repository, setRepository] = useState<RepositoryContext | null>(null)
  const [contextLoading, setContextLoading] = useState(true)
  const [source, setSource] = useState<RunConfig['provider']>()
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const [selected, setSelected] = useState<string | null>(null)
  const [parallelism, setParallelism] = useState(2)
  const panel = useRef<HTMLDivElement>(null)
  const controller = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const mutation = useRef(false)
  const hydrated = useRef<string | null>(null)
  const commandsEdited = useRef(false)
  const run = snapshot.run
  const allowed = captainActionAvailability(run?.status, loaded, busy)
  const task = run?.tasks.find(item => item.id === selected)
  const set = <K extends keyof RunConfig>(key: K, value: RunConfig[K]) => setConfig(previous => ({ ...previous, [key]: value }))

  useEffect(() => {
    if (!loaded || run) return
    const abort = new AbortController()
    setContextLoading(true)
    void request<RepositoryContext>(`/api/darkingdoom/context?sessionId=${encodeURIComponent(sessionId)}${source ? `&provider=${source}` : ''}`, abort.signal).then(value => {
      if (abort.signal.aborted || hydrated.current) return
      setRepository(value)
      setConfig(previous => ({ ...previous, provider:value.config.provider, workspace:value.config.workspace, repository:value.config.repository, organization:value.config.organization, project:value.config.project, remote:value.config.remote, targetBranch:value.config.targetBranch, query:undefined }))
      setMilestones(value.config.milestones.join('\n'))
      if (!commandsEdited.current) setCommands(value.config.verifyCommands.join('\n'))
    }).catch(cause => { if (!abort.signal.aborted) { setRepository(null); setError(String(cause instanceof Error ? cause.message : cause)) } })
      .finally(() => { if (!abort.signal.aborted) setContextLoading(false) })
    return () => abort.abort()
  }, [loaded, !!run, sessionId, source])

  const refresh = useCallback(async (signal: AbortSignal) => {
    const version = ++generation.current
    const value = await request<Snapshot>(`/api/darkingdoom/state?sessionId=${encodeURIComponent(sessionId)}`, signal)
    if (!value || typeof value !== 'object' || !('run' in value)) throw new Error('DarKingDoom Plugin returned an invalid state')
    if (signal.aborted || version !== generation.current) return
    setSnapshot(value)
    setLoaded(true)
    if (value.run && hydrated.current !== value.run.id) {
      hydrated.current = value.run.id
      setConfig(value.run.config)
      setMilestones(value.run.config.milestones.join('\n'))
      setCommands(value.run.config.verifyCommands.join('\n'))
      setParallelism(value.run.config.parallelism)
    }
  }, [sessionId])

  useEffect(() => {
    const abort = new AbortController()
    controller.current = abort
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      if (!mutation.current) {
        try { await refresh(abort.signal) } catch (cause) { if (!abort.signal.aborted) setError(String(cause instanceof Error ? cause.message : cause)) }
      }
      if (!abort.signal.aborted) timer = setTimeout(() => { void poll() }, 3000)
    }
    void poll()
    const clock = setInterval(() => setNow(Date.now()), 1000)
    return () => { abort.abort(); clearTimeout(timer); clearInterval(clock); generation.current++ }
  }, [refresh])

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panel.current?.focus()
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
      if (event.key !== 'Tab') return
      const nodes = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex="0"]') ?? []).filter(node => node.getClientRects().length)
      const first = nodes[0], last = nodes.at(-1)
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', keys)
    return () => { document.removeEventListener('keydown', keys); previous?.focus() }
  }, [onClose])

  async function mutate(action?: Action) {
    const signal = controller.current?.signal
    if (!signal || mutation.current) return
    mutation.current = true; generation.current++; setBusy(true)
    try {
      await request(action ? '/api/darkingdoom/control' : '/api/darkingdoom/start', signal, action
        ? { sessionId, action, ...(action === 'parallelism' ? { parallelism } : {}) }
        : { sessionId, config: { ...config, milestones: lines(milestones), verifyCommands: lines(commands) } })
      await refresh(signal)
    } catch (cause) { if (!signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { mutation.current = false; if (!signal.aborted) setBusy(false) }
  }
  function start(event: FormEvent) { event.preventDefault(); void mutate() }
  async function navigate(childId: string) {
    try { await openSession(sessionId, childId); onClose() } catch (cause) { setError(`Could not open worker session: ${String(cause)}`) }
  }
  const merged = run?.tasks.filter(item => item.status === 'merged').length ?? 0
  const working = run?.tasks.filter(item => !terminal(item)).length ?? 0
  const blockers = run?.tasks.filter(item => item.error || item.status === 'blocked' || item.status === 'failed') ?? []
  const totalTaskTime = run?.tasks.reduce((sum, item) => sum + elapsedMs(item.startedAt, item.finishedAt, now), 0) ?? 0
  const eligibility = snapshot.eligibility ?? run?.tickets.map(ticket => {
    const existing = run.tasks.find(item => item.ticket.id === ticket.id)
    return { ticketId: ticket.id, eligible: false, reason: existing ? `Task ${existing.status}` : ticket.exclusion ?? (ticket.merged ? 'Already merged' : ticket.state === 'closed' ? 'Closed' : 'Awaiting captain eligibility evaluation') }
  }) ?? []

  return <div className={css.backdrop}>
    <div className={css.panel} ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="darkingdoom-title" data-darkingdoom>
      <header className={css.header}><div className={css.heading}><span className={css.mark} aria-hidden>⌁</span><div><span className={css.eyebrow}>AUTONOMOUS DELIVERY</span><h1 id="darkingdoom-title">DarKingDoom Plugin</h1></div><span className={css.status} data-status={run?.status ?? 'idle'}>{run?.status ?? 'Not started'}</span></div><button type="button" onClick={onClose} aria-label="Close DarKingDoom Plugin">✕</button></header>
      <div className={css.owner}>Session <code>{sessionId}</code><span>Opening this panel never starts a run.</span></div>
      {error && <div className={css.error} role="alert"><span>{error}</span><button type="button" onClick={() => setError(null)}>Dismiss</button></div>}
      {run?.error && <div className={css.error} role="alert">Captain: {run.error}</div>}
      <div className={css.body}>
        <aside className={css.configuration}><div className={css.sectionTitle}><h2>Run configuration</h2><span>{run ? 'Saved run configuration' : contextLoading ? 'Loading repository configuration…' : 'From the current session repository'}</span></div>
          {!run && repository?.warnings.map((warning,index) => <p className={css.muted} key={index}>{warning}</p>)}
          <form onSubmit={start}>
            <fieldset disabled={!!run || busy || !loaded} className={css.fields}>
              <label>Ticket source<select disabled={contextLoading && loaded} value={config.provider} onChange={event => { setContextLoading(true); setSource(event.target.value as RunConfig['provider']) }}><option value="github" disabled={repository ? !repository.providers.includes('github') : false}>GitHub Issues</option><option value="azure" disabled={repository ? !repository.providers.includes('azure') : false}>Azure DevOps</option></select></label>
              <label>Repository<input required readOnly value={config.repository} placeholder="Detected from this session" /></label>
              <label>Workspace<input required readOnly value={config.workspace} placeholder="Current session repository" /></label>
              {config.provider === 'azure' && <><label>Organization URL<input required readOnly value={config.organization ?? ''} /></label><label>Project<input required readOnly value={config.project ?? ''} /></label></>}
              <label>Query <span className={css.optional}>(optional)</span><textarea rows={2} value={config.query ?? ''} onChange={event => set('query', event.target.value)} placeholder={config.provider === 'azure' ? 'WIQL query' : 'Additional issue search filters'} /></label>
              <label>Milestones, in delivery order<textarea disabled={contextLoading} required rows={3} value={milestones} onChange={event => setMilestones(event.target.value)} placeholder="Detected delivery milestones" /><small>{repository?.milestoneSource || 'One exact milestone name per line.'}</small></label>
              <div className={css.pair}><label>Remote<input required readOnly value={config.remote} /></label><label>Target branch<input required readOnly value={config.targetBranch} /></label></div>
              <div className={css.pair}><label>Parallel tickets<input required type="number" min={1} max={32} value={config.parallelism} onChange={event => set('parallelism', Number(event.target.value))} /></label><label>Members / team<input required type="number" min={1} max={16} value={config.maxTeamMembers} onChange={event => set('maxTeamMembers', Number(event.target.value))} /></label></div>
              <label>Verification commands<textarea disabled={contextLoading} required rows={3} value={commands} onChange={event => { commandsEdited.current = true; setCommands(event.target.value) }} placeholder="Detected repository checks" /><small>{repository?.verificationSource || 'One host command per line, run in each task worktree.'}</small></label>
              <details><summary>Execution limits & verification</summary><div className={css.fields}>
                <div className={css.pair}><label>Poll seconds<input required type="number" min={5} max={3600} value={config.pollSeconds} onChange={event => set('pollSeconds', Number(event.target.value))} /></label><label>Repair rounds<input required type="number" min={0} max={20} value={config.maxRepairRounds} onChange={event => set('maxRepairRounds', Number(event.target.value))} /></label></div>
                <label>Task timeout (minutes)<input required type="number" min={1} max={1440} value={config.maxTaskMinutes} onChange={event => set('maxTaskMinutes', Number(event.target.value))} /></label>
                <label>Worker preset<input required value={config.workerPreset} onChange={event => set('workerPreset', event.target.value)} /></label>
                <label className={css.check}><input type="checkbox" checked={config.requireMemory} onChange={event => set('requireMemory', event.target.checked)} />Require durable memory</label>
                <label className={css.check}><input type="checkbox" checked={config.requireBrowser} onChange={event => set('requireBrowser', event.target.checked)} />Require browser verification</label>
              </div></details>
            </fieldset>
            <p className={css.authorization}>Start authorizes full access execution, autonomous repair, review, merge and ticket closure within this configuration. The captain answers worker questions automatically.</p>
            <button type="submit" className={css.primary} disabled={!allowed.start || contextLoading || !repository || !config.targetBranch || !lines(milestones).length || lines(milestones).some(name=>!repository.milestoneCatalog.includes(name)) || !lines(commands).length}>{busy ? 'Applying…' : run ? 'Run already created' : 'Start DarKingDoom Plugin'}</button>
            {run?.status === 'stopped' && <p className={css.muted}>Use Resume to continue this saved run with its existing tasks and claims.</p>}
            {!loaded && <p className={css.muted}>Loading saved run before enabling Start…</p>}
          </form>
        </aside>
        <main className={css.monitor}>
          <div className={css.metrics}>
            <div><span>Wall time</span><strong>{run ? duration(elapsedMs(run.createdAt, run.status === 'stopped' ? run.updatedAt : undefined, now)) : '—'}</strong><small>Includes waiting & pauses</small></div>
            <div><span>Working / parallel limit</span><strong>{working}<em> / {run?.config.parallelism ?? config.parallelism}</em></strong><small>{merged} merged · {run?.tickets.length ?? 0} discovered</small></div>
            <div><span>Task elapsed, summed</span><strong>{run ? duration(totalTaskTime) : '—'}</strong><small>Overlaps; includes waiting</small></div>
            <div><span>Active agent effort</span><strong className={css.unmeasured}>Not measured</strong><small>No runtime effort telemetry</small></div>
          </div>
          <div className={css.controls} aria-label="Run controls">
            <button disabled={!allowed.pause} onClick={() => void mutate('pause')}>Pause</button>
            <button disabled={!allowed.resume} onClick={() => void mutate('resume')}>Resume</button>
            <button disabled={!allowed.drain} onClick={() => void mutate('drain')} title="Finish active work without taking more tickets">Drain</button>
            <button className={css.danger} disabled={!allowed.stop} onClick={() => void mutate('stop')}>Stop</button>
            <label>Parallelism<input aria-label="Live parallelism" type="number" min={1} max={32} value={parallelism} disabled={!allowed.parallelism} onChange={event => setParallelism(Number(event.target.value))} /></label>
            <button disabled={!allowed.parallelism || !Number.isInteger(parallelism) || parallelism < 1 || parallelism > 32} onClick={() => void mutate('parallelism')}>Apply</button>
          </div>
          <p className={css.controlHint}>Pause holds new dispatch. Drain finishes active tickets. Stop cancels active work.</p>
          <section className={css.card}><div className={css.sectionTitle}><h2>Delivery queue</h2><span>{run?.lastPollAt ? `Last discovery ${new Date(run.lastPollAt).toLocaleTimeString()}` : 'Awaiting discovery'}</span></div>
            <div className={css.tableScroll}><table><thead><tr><th>Ticket / task</th><th>Milestone</th><th>Status</th><th>Phase</th><th>Elapsed</th><th>Reviews</th><th>Open</th></tr></thead><tbody>
              {run?.tasks.map(item => <tr key={item.id} data-selected={selected === item.id}><td><button className={css.taskButton} onClick={() => setSelected(item.id)}><code>{item.ticket.id}</code><strong>{item.ticket.title}</strong><small>{item.id}</small></button></td><td>{item.ticket.milestone}</td><td><span className={css.status} data-status={item.status}>{item.status}</span></td><td>{item.phase}</td><td className={css.numeric}>{duration(elapsedMs(item.startedAt, item.finishedAt, now))}</td><td className={css.numeric}>{item.reviewRounds}</td><td><div className={css.links}>{item.sessionId && <button onClick={() => void navigate(item.sessionId)}>Session ↗</button>}{webUrl(item.prUrl) && <a href={webUrl(item.prUrl)} target="_blank" rel="noreferrer">PR ↗</a>}{webUrl(item.ticket.url) && <a href={webUrl(item.ticket.url)} target="_blank" rel="noreferrer">Ticket ↗</a>}</div></td></tr>)}
            </tbody></table></div>
            {!run?.tasks.length && <div className={css.empty}><span aria-hidden>⌁</span><h3>{run ? 'Watching the delivery queue' : 'Your next milestone starts here'}</h3><p>{run ? 'Tasks appear after the captain discovers and admits eligible tickets.' : 'Choose a source, order your milestones, then explicitly start the captain.'}</p></div>}
          </section>
          {task && <section className={css.card}><div className={css.sectionTitle}><h2>{task.ticket.id} · Phase timeline</h2><button onClick={() => setSelected(null)} aria-label="Close task details">✕</button></div>
            <div className={css.phaseTotals}>{phaseDurations(task, now).map(row => <span key={row.phase}>{row.phase}<strong>{duration(row.milliseconds)}</strong></span>)}</div>
            <ol className={css.timeline}>{task.phases.map((event, index) => <li key={`${event.at}-${index}`}><time>{new Date(event.at).toLocaleTimeString()}</time><strong>{event.phase}</strong>{event.note && <p>{event.note}</p>}</li>)}</ol>
            <div className={css.taskMetadata}><span>Branch <code>{task.branch}</code></span><span>Worktree <code>{task.worktree}</code></span>{task.mergedSha && <span>Merged <code>{task.mergedSha}</code></span>}</div>
            <CaptainReviewEvidence task={task} />
          </section>}
          <div className={css.lowerGrid}>
            <section className={css.card}><div className={css.sectionTitle}><h2>Eligibility</h2><span>{eligibility.length} tickets</span></div><ul className={css.records}>{eligibility.map(row => <li key={row.ticketId}><code>{row.ticketId}</code><span className={css.status} data-status={row.eligible ? 'ready' : 'waiting'}>{row.eligible ? 'Eligible' : 'Held'}</span><p>{row.reason}</p></li>)}</ul>{!eligibility.length && <p className={css.placeholder}>Discovery decisions will appear here.</p>}</section>
            <section className={css.card}><div className={css.sectionTitle}><h2>Blockers & decisions</h2><span>Orchestrator managed</span></div><ul className={css.records}>{blockers.map(item => <li key={item.id}><strong>{item.ticket.id} · {item.status}</strong><p>{item.error ?? 'Waiting for the captain to resolve this blocker.'}</p></li>)}{run?.questions.map(question => <li key={question.id}><small>{question.taskId} · {new Date(question.createdAt).toLocaleTimeString()}</small><strong>{question.question}</strong><p className={question.answer ? css.answer : css.muted}>{question.answer ?? 'Orchestrator is preparing an automatic answer…'}</p>{question.answer && <small>{question.deliveredAt ? 'Delivered to worker' : 'Answer queued for delivery'}</small>}</li>)}</ul>{!blockers.length && !run?.questions.length && <p className={css.placeholder}>No blockers or worker questions recorded.</p>}</section>
          </div>
          <footer className={css.footer}><span className={css.liveDot} />Refreshes every 3 seconds while open<span>{run ? `Run ${run.id}` : 'Automation is disabled'}</span></footer>
        </main>
      </div>
    </div>
  </div>
}
