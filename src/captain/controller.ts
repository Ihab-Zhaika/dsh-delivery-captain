import { randomUUID, createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import type { FollowupInput, Phase, Question, Run, RunConfig, Task, TicketProvider, WorkerRuntime } from './types.ts'
import { eligibility, validateConfig, taskConfig } from './scheduler.ts'
import { RunStore } from './store.ts'

const TERMINAL = new Set<Task['status']>(['merged', 'failed', 'cancelled'])
const PHASES: Phase[] = ['setup','analysis','implementation','testing','review','repair','integration','waiting','blocked','complete']
const now = (): string => new Date().toISOString()
const isStopped = (run: Run): boolean => run.status === 'stopped'
export const repositoryKey = (c: RunConfig): string => JSON.stringify([c.provider, c.organization?.toLowerCase(), c.project?.toLowerCase(), c.repository.toLowerCase()])

/** Durable orchestration; timers call tick, models only report and answer questions. */
export class CaptainController {
  private readonly store: RunStore
  private readonly runtime: WorkerRuntime
  private readonly providerFactory: (config: RunConfig) => TicketProvider
  private readonly runs = new Map<string, Run>()
  private readonly starting = new Set<string>()
  private readonly startingSessions = new Set<string>()
  private readonly activeProviders = new Map<string, TicketProvider>()
  private ticking?: Promise<void>
  private disposed = false
  constructor(store: RunStore, runtime: WorkerRuntime, providerFactory: (config: RunConfig) => TicketProvider) {
    this.store = store; this.runtime = runtime; this.providerFactory = providerFactory
  }

  /** Rehydrate only explicitly started runs. Startup does not opt ordinary sessions in. */
  async restore(): Promise<void> {
    for (const run of await this.store.loadAll()) {
      validateConfig(run.config)
      const previous = this.runs.get(run.captainSessionId)
      if (previous && previous.createdAt > run.createdAt) continue
      // Workspace membership is independent of execution: retain completed and
      // stopped task histories under their worktrees without waking a model.
      let groupingChanged = false
      if (this.runtime.registerWorkspace) for (const task of run.tasks.filter(t => t.baseSha)) {
        const previousGrouping = JSON.stringify([task.workspaceId, task.workspaceError])
        try { await this.runtime.registerWorkspace(task, run); delete task.workspaceError }
        catch (error) { task.workspaceError = `Workspace registration failed: ${String(error)}` }
        groupingChanged ||= previousGrouping !== JSON.stringify([task.workspaceId, task.workspaceError])
      }
      // Grouping migration must not extend a stopped run's elapsed duration.
      if (groupingChanged) await this.store.save(run)
      if (!isStopped(run)) {
        await this.store.acquire(repositoryKey(run.config))
        try { await this.providerFactory(run.config).preflight(); await this.runtime.preflight(run.config) }
        catch (error) { run.error = `Recovery preflight failed: ${String(error)}`; run.recoveryPending = true; await this.save(run) }
      }
      this.runs.set(run.captainSessionId, run)
      if (!isStopped(run) && !run.recoveryPending) {
        try { for (const task of run.tasks.filter(t => !TERMINAL.has(t.status) && t.baseSha)) await this.runtime.restore?.(task, run) }
        catch (error) { run.error = `Recovery worker restore failed: ${String(error)}`; run.recoveryPending = true; await this.save(run) }
      }
    }
  }
  state(sessionId: string): Run | null {
    return this.runs.get(sessionId) ?? [...this.runs.values()].find(run => run.tasks.some(t => t.sessionId === sessionId)) ?? null
  }
  all(): Run[] { return [...this.runs.values()] }
  private async save(run: Run): Promise<void> { run.updatedAt = now(); await this.store.save(run) }
  private captain(sessionId: string): Run {
    const run = this.runs.get(sessionId)
    if (!run) throw new Error('Session is not an explicitly activated captain')
    return run
  }
  private worker(sessionId: string): { run: Run; task: Task } {
    for (const run of this.runs.values()) {
      const task = run.tasks.find(t => t.sessionId === sessionId && !TERMINAL.has(t.status))
      if (task && !isStopped(run)) return { run, task }
    }
    throw new Error('Session is not an active assigned worker')
  }
  private phase(task: Task, phase: Phase, note?: string): void {
    if (task.phase !== phase) { task.phase = phase; task.phases.push({ phase, at: now(), ...note ? { note } : {} }) }
  }

  async start(sessionId: string, raw: unknown): Promise<Run> {
    if (this.disposed) throw new Error('Captain plugin is stopping')
    if (!sessionId || sessionId.length > 200) throw new Error('Invalid captain session identity')
    const config = validateConfig(raw), key = repositoryKey(config)
    if (this.state(sessionId) || this.startingSessions.has(sessionId)) throw new Error('Session already belongs to a run; use Resume for a stopped run')
    if (this.starting.has(key) || [...this.runs.values()].some(r => repositoryKey(r.config) === key && r.status !== 'stopped')) throw new Error('Repository already owned by a captain')
    this.starting.add(key)
    this.startingSessions.add(sessionId)
    try {
      await this.store.acquire(key)
      try {
        await this.providerFactory(config).preflight()
        await this.runtime.preflight(config)
        const run: Run = { version: 1, id: randomUUID(), captainSessionId: sessionId, config, status: 'running', createdAt: now(), updatedAt: now(), tasks: [], tickets: [], questions: [] }
        await this.save(run); this.runs.set(sessionId, run)
        return run
      } catch (error) { await this.store.release(key); throw error }
    } finally { this.starting.delete(key); this.startingSessions.delete(sessionId) }
  }

  async control(sessionId: string, action: string, parallelism?: number): Promise<Run> {
    const run = this.captain(sessionId)
    if (action === 'parallelism') run.config = validateConfig({ ...run.config, parallelism })
    else if (action === 'pause') run.status = 'paused'
    else if (action === 'drain') run.status = 'draining'
    else if (action === 'resume') {
      if ([...this.runs.values()].some(r => r.id !== run.id && r.status !== 'stopped' && repositoryKey(r.config) === repositoryKey(run.config))) throw new Error('Repository already owned by a different run')
      await this.store.acquire(repositoryKey(run.config))
      await this.providerFactory(run.config).preflight()
      await this.runtime.preflight(run.config)
      run.status = 'running'
      for (const t of run.tasks.filter(t => t.status === 'cancelled')) { t.status = 'blocked'; t.resumeRequested = true; delete t.finishedAt; t.recoveryAttempts = 0; delete t.lastWakeAt }
    } else if (action === 'stop') {
      run.status = 'stopped'
      this.activeProviders.get(run.id)?.cancel?.()
      // Commit revocation before awaiting cancellation: late worker reports cannot mutate delivery.
      await this.save(run)
      await this.drainWorkers(run, false)
      // A worker may still be inside create/start. Drain that operation before cancelling the final roster.
      await this.ticking
      const shutdownErrors = await this.drainWorkers(run, true)
      await this.save(run)
      // A tick may still be finishing an external call. Keep the repository lease until it quiesces.
      if (!shutdownErrors.length) await this.store.release(repositoryKey(run.config))
    } else throw new Error('Unknown captain control action')
    await this.save(run)
    return run
  }

  async report(sessionId: string, report: { phase: Phase; ready?: boolean; blocked?: boolean; note?: string }): Promise<Task> {
    const { run, task } = this.worker(sessionId)
    if (!PHASES.includes(report.phase) || report.phase === 'complete') throw new Error('Only verified merge can complete a task')
    if (report.ready && report.blocked) throw new Error('A task cannot be ready and blocked together')
    delete task.resumeRequested
    this.phase(task, report.phase, report.note)
    if (report.ready) { task.status = 'ready'; this.phase(task, 'waiting', 'Queued for independent verification and merge') }
    else if (report.blocked) { task.status = 'blocked'; task.error = report.note ?? 'Worker blocked'; task.lastWakeAt = now() }
    await this.save(run)
    if (report.blocked) await this.notify(run, `Worker ${task.id} is blocked: ${task.error}. Resolve within its acceptance criteria; use darkingdoom_message to guide the worker. No human approval is required.`)
    return task
  }

  async question(sessionId: string, question: string): Promise<Question> {
    const { run, task } = this.worker(sessionId)
    if (!question.trim() || question.length > 20000) throw new Error('Question must be 1–20000 characters')
    const duplicate = run.questions.find(q => q.taskId === task.id && q.question === question && !q.answer)
    if (duplicate) return duplicate
    const item: Question = { id: randomUUID(), taskId: task.id, question, createdAt: now() }
    run.questions.push(item); await this.save(run)
    await this.notifyQuestion(run, item)
    return item
  }

  async answer(sessionId: string, questionId: string, answer: string): Promise<Question> {
    const run = this.captain(sessionId)
    if (isStopped(run)) throw new Error('Captain run stopped')
    const q = run.questions.find(q => q.id === questionId)
    if (!q || !answer.trim() || answer.length > 30000) throw new Error('Invalid question or answer')
    q.answer = answer; q.answeredAt = now(); delete q.deliveredAt; await this.save(run)
    await this.deliverAnswer(run, q)
    return q
  }

  private async deliverAnswer(run: Run, q: Question): Promise<void> {
    const task = run.tasks.find(t => t.id === q.taskId)
    if (!task || TERMINAL.has(task.status) || isStopped(run)) return
    if (task.status === 'blocked' && this.activeCount(run) >= run.config.parallelism) return
    delete task.resumeRequested
    task.status = 'running'; await this.save(run)
    await this.runtime.send(task.sessionId, `Captain answer to ${q.id}: ${q.answer}`)
    if (isStopped(run) || this.disposed) { await this.runtime.stop(task.sessionId); return }
    this.phase(task, 'analysis'); delete task.error
    q.deliveredAt = now(); task.lastWakeAt = now(); await this.save(run)
  }

  async message(sessionId: string, taskId: string, text: string): Promise<void> {
    const run = this.captain(sessionId), task = run.tasks.find(t => t.id === taskId)
    if (!task || TERMINAL.has(task.status) || isStopped(run)) throw new Error('Task is not active')
    if (!text.trim() || text.length > 30000) throw new Error('Invalid worker message')
    if (task.status === 'blocked' && this.activeCount(run) >= run.config.parallelism) throw new Error('No execution slot available; answer will need to wait')
    delete task.resumeRequested
    task.status = 'running'; await this.save(run)
    await this.runtime.send(task.sessionId, `Captain guidance: ${text}`)
    if (isStopped(run) || this.disposed) { await this.runtime.stop(task.sessionId); return }
    task.status = 'running'; task.lastWakeAt = now(); this.phase(task, 'analysis'); delete task.error; await this.save(run)
  }

  async followup(sessionId: string, input: FollowupInput): Promise<string> {
    const { run, task } = this.worker(sessionId)
    if (!input.title.trim() || !input.body.trim() || !run.config.milestones.includes(input.milestone) || !Array.isArray(input.predecessors) || input.predecessors.some(x => typeof x !== 'string')) throw new Error('Follow-up requires title, scope/acceptance body, configured milestone and predecessor IDs')
    const id = await this.providerFactory(run.config).createFollowup(task, input)
    if (!task.followups.includes(id)) task.followups.push(id)
    await this.save(run); return id
  }

  private activeCount(run: Run): number { return run.tasks.filter(t => ['starting','running','ready'].includes(t.status)).length }
  async announce(run: Run, text: string): Promise<void> { await this.notify(run, text) }
  private async notify(run: Run, text: string): Promise<boolean> {
    try { await this.runtime.send(run.captainSessionId, text); return true } catch (error) { run.error = `Captain delivery deferred: ${String(error)}`; await this.save(run); return false }
  }
  private async notifyQuestion(run: Run, q: Question): Promise<void> {
    q.lastNotifyAttemptAt = now(); await this.save(run)
    if (await this.notify(run, `Worker question ${q.id} (task ${q.taskId}):\n${q.question}\nDecide autonomously using project evidence and reply using darkingdoom_answer. Do not ask the human.`)) q.notifiedAt = now()
    await this.save(run)
  }

  /** Deduplicated timer entry. No model polling is required for queue discovery. */
  tick(): Promise<void> {
    if (this.disposed) return Promise.resolve()
    if (this.ticking) return this.ticking
    this.ticking = this.tickAll().finally(() => { this.ticking = undefined })
    return this.ticking
  }
  private async tickAll(): Promise<void> {
    for (const run of this.runs.values()) {
      if (isStopped(run) || this.disposed) continue
      try { await this.tickRun(run) } catch (error) { if (!isStopped(run) && !this.disposed) { run.error = String(error); await this.save(run) } }
      finally { this.activeProviders.delete(run.id) }
    }
  }

  private async tickRun(run: Run): Promise<void> {
    const provider = this.providerFactory(run.config)
    this.activeProviders.set(run.id, provider)
    if (run.recoveryPending) {
      await provider.preflight(); await this.runtime.preflight(run.config)
      for (const task of run.tasks.filter(t => !TERMINAL.has(t.status) && t.baseSha)) await this.runtime.restore?.(task, run)
      delete run.recoveryPending
    }
    run.tickets = await provider.discover(); run.lastPollAt = now(); delete run.error
    if(run.config.ticketIds)run.tickets=run.tickets.map(ticket=>!ticket.exclusion&&!run.config.ticketIds!.includes(ticket.id)?{...ticket,exclusion:'Outside configured ticket selection'}:ticket)
    // Reconcile confirmed delivery/closure even if the previous process died after merge.
    for (const task of run.tasks) {
      if (isStopped(run) || this.disposed) return
      if (task.status === 'merged' && !task.closedAt) {
        try { await provider.close(task); task.closedAt = now(); delete task.error } catch (error) { task.error = `Merged; ticket closure pending: ${String(error)}` }
        await this.save(run); continue
      }
      if (TERMINAL.has(task.status)) continue
      if (task.prUrl && task.headSha && task.reviewHistory?.some(r => r.passed && r.headSha === task.headSha)) {
        // A process or network failure may have lost the merge acknowledgement. Reconcile before waking a writer.
        const existing = await provider.inspectPullRequest(task)
        if (existing.merged) {
          if (existing.headSha !== task.headSha || !existing.mergeSha) throw new Error(`Task ${task.id}: merged PR differs from persisted review`)
          await this.runtime.stop(task.sessionId)
          task.status = 'merged'; task.mergedSha = existing.mergeSha; task.finishedAt = now(); this.phase(task, 'complete'); await this.save(run)
          try { await provider.close(task); task.closedAt = now(); delete task.error } catch (error) { task.error = `Merged; ticket closure pending: ${String(error)}` }
          await this.save(run); continue
        }
      }
      if (Date.now() - Date.parse(task.startedAt) > run.config.maxTaskMinutes * 60000) {
        await this.runtime.stop(task.sessionId); task.status = 'failed'; task.error = 'Task time budget exhausted'; task.finishedAt = now(); this.phase(task, 'blocked', task.error); await this.save(run); continue
      }
      if (task.status === 'ready') { await this.integrate(run, task, provider); continue }
      if (task.status === 'blocked') {
        if (run.status === 'running' && task.resumeRequested && this.activeCount(run) < run.config.parallelism) {
          delete task.resumeRequested; task.status = 'starting'; await this.save(run)
          await this.launch(run, task, provider); continue
        }
        if (await this.runtime.isRunning(task.sessionId)) await this.runtime.stop(task.sessionId)
        continue
      }
      if (task.status === 'starting') { await this.launch(run, task, provider); continue }
      if (!await this.runtime.isRunning(task.sessionId) && Date.now() - Date.parse(task.lastWakeAt ?? task.startedAt) > 30000) {
        if ((task.recoveryAttempts ?? 0) >= run.config.maxRepairRounds) { task.status = 'blocked'; task.error = 'Worker stopped without completing its delivery contract'; this.phase(task, 'blocked', task.error) }
        else {
          task.recoveryAttempts = (task.recoveryAttempts ?? 0) + 1; task.lastWakeAt = now(); await this.save(run)
          await this.runtime.start(task, run)
        }
      }
    }
    for (const q of run.questions) {
      if (isStopped(run)) return
      if (q.answer && !q.deliveredAt) await this.deliverAnswer(run, q)
      if (!q.answer && Date.now() - Date.parse(q.lastNotifyAttemptAt ?? q.createdAt) >= (q.notifiedAt ? 300000 : 60000)) await this.notifyQuestion(run, q)
    }
    // Admission counts persisted attempts, including blocked/failed setup. A trial
    // must never substitute another ticket or reset its cap after a restart.
    if (run.config.maxTickets > 0 && run.tasks.length >= run.config.maxTickets && run.tasks.every(t => TERMINAL.has(t.status) && (t.status !== 'merged' || t.closedAt))) {
      run.status = 'stopped'; await this.save(run); await this.store.release(repositoryKey(run.config)); return
    }
    // Retry parked technical blockers with bounded recovery, never unlimited model loops.
    for (const task of run.tasks.filter(t => t.status === 'blocked')) {
      if (run.status !== 'running' || this.activeCount(run) >= run.config.parallelism) break
      if (task.resumeRequested) continue
      if ((task.recoveryAttempts ?? 0) >= run.config.maxRepairRounds || Date.now() - Date.parse(task.lastWakeAt ?? task.startedAt) < 60000) continue
      task.recoveryAttempts = (task.recoveryAttempts ?? 0) + 1; task.status = 'running'; task.lastWakeAt = now(); this.phase(task, 'analysis'); await this.save(run)
      await this.launch(run, task, provider)
    }
    if (run.status === 'draining' && this.activeCount(run) === 0) {
      run.status = 'stopped'; await this.save(run); await this.store.release(repositoryKey(run.config)); return
    }
    if (run.status !== 'running' || this.disposed) { await this.save(run); return }
    const rows = eligibility(run.tickets, run.config.milestones, run.tasks)
    const eligible = new Set(rows.filter(r => r.eligible).map(r => r.ticketId))
    const queue = run.tickets.filter(t => eligible.has(t.id)).sort((a,b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    for (const ticket of queue) {
      if (run.status !== 'running' || this.disposed || this.activeCount(run) >= run.config.parallelism || run.config.maxTickets > 0 && run.tasks.length >= run.config.maxTickets) break
      const id = randomUUID(), attempt = randomUUID(), startedAt = now()
      const safe = ticket.id.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 40)
      const branch = `captain/${safe}-${id.slice(0,8)}`
      const repoHash = createHash('sha256').update(repositoryKey(run.config)).digest('hex').slice(0, 12)
      const task: Task = { id, ticket, attempt, sessionId: randomUUID(), branch, worktree: join(dirname(run.config.workspace), '.delivery-worktrees', repoHash, id), baseSha: '', status: 'starting', phase: 'setup', phases: [{ phase: 'setup', at: startedAt }], startedAt, reviewRounds: 0, followups: [] }
      run.tasks.push(task); await this.save(run)
      await this.launch(run, task, provider)
    }
    await this.save(run)
  }

  private async launch(run: Run, task: Task, provider: TicketProvider): Promise<void> {
    try {
      await provider.claim(task.ticket, run.id)
      if (isStopped(run) || this.disposed) return
      await this.runtime.prepare(task, run.config); await this.save(run)
      if (isStopped(run) || this.disposed) return
      await this.runtime.start(task, run)
      if (isStopped(run) || this.disposed) { await this.runtime.stop(task.sessionId); return }
      task.status = 'running'; task.lastWakeAt = now(); this.phase(task, 'analysis')
    } catch (error) { task.status = 'blocked'; task.error = String(error); task.lastWakeAt = now(); this.phase(task, 'blocked', task.error) }
    await this.save(run)
  }

  private async integrate(run: Run, task: Task, provider: TicketProvider): Promise<void> {
    try {
      await this.runtime.stop(task.sessionId)
      if (isStopped(run) || this.disposed) return
      const previous = task.reviewHistory?.at(-1)
      const verification=taskConfig(run.config,task.ticket.id)
      const cached = previous?.passed && await this.runtime.isReviewCurrent?.(task, verification, previous)
      if (!cached) { this.phase(task, 'testing'); await this.save(run) }
      const review = cached && previous ? previous : await this.runtime.review(task, verification, async phase => { if (isStopped(run) || this.disposed) throw new Error('Run stopped'); this.phase(task, phase); await this.save(run) })
      if (!cached) (task.reviewHistory ??= []).push({ ...review, at: now() })
      await this.save(run)
      if (isStopped(run) || this.disposed) return
      if (!review.passed) { await this.repair(run, task, review.findings.join('\n') || 'Verification/review failed'); return }
      task.headSha = review.headSha; this.phase(task, 'integration'); await this.save(run)
      let pr = await provider.ensurePullRequest(task); task.prUrl = pr.url; await this.save(run)
      if (!pr.merged) pr = await provider.inspectPullRequest(task)
      if (pr.merged && (pr.headSha !== review.headSha || !pr.mergeSha)) throw new Error('Merged pull request does not match the reviewed head or lacks a merge commit')
      if (!pr.merged && (!pr.checksPassed || pr.headSha !== review.headSha)) { this.phase(task, 'waiting', pr.blockedReason ?? 'Waiting for remote checks on reviewed head'); await this.save(run); return }
      if (isStopped(run) || this.disposed) return
      if (!pr.merged) {
        if (await this.runtime.head(task) !== review.headSha) { await this.repair(run, task, 'Branch changed after verification; review the latest commit'); return }
        if (this.runtime.isReviewCurrent && !await this.runtime.isReviewCurrent(task, verification, review)) { await this.repair(run, task, 'Reviewed head or target branch changed before merge; synchronize and verify again'); return }
        if (isStopped(run) || this.disposed) return
        pr = await provider.merge(task, review.headSha)
      }
      if (!pr.merged) { this.phase(task, 'waiting', pr.blockedReason ?? 'Merge queued'); await this.save(run); return }
      if (pr.headSha !== review.headSha || !pr.mergeSha) throw new Error('Cannot confirm exact-head merge')
      task.status = 'merged'; task.mergedSha = pr.mergeSha; task.finishedAt = now(); this.phase(task, 'complete'); delete task.error
      await this.save(run)
      try { await provider.close(task); task.closedAt = now() } catch (error) { task.error = `Merged; ticket closure pending: ${String(error)}` }
      await this.save(run)
    } catch (error) {
      if (!isStopped(run)) await this.repair(run, task, String(error))
    }
  }
  private async repair(run: Run, task: Task, reason: string): Promise<void> {
    task.error = reason
    if (task.reviewRounds >= run.config.maxRepairRounds) {
      task.status = 'blocked'; task.recoveryAttempts = run.config.maxRepairRounds; this.phase(task, 'blocked', 'Repair budget exhausted'); await this.save(run)
      await this.notify(run, `Ticket ${task.ticket.id} exhausted repair rounds. Evidence: ${reason}. Keep it blocked unless you have a specific new solution; no bypass of review or scope is permitted.`)
      return
    }
    task.reviewRounds++; task.status = 'running'; task.lastWakeAt = now(); this.phase(task, 'repair', reason); await this.save(run)
    await this.runtime.send(task.sessionId, `Delivery gate failed (round ${task.reviewRounds}):\n${reason}\nUse the installed ORIGINAL AgentTeams to investigate and repair these findings with approval="automatic". Rerun verification, commit fixes, and report ready. Do not defer current acceptance failures to follow-ups or bypass gates.`)
  }

  async dispose(): Promise<void> {
    this.disposed = true
    for (const provider of this.activeProviders.values()) provider.cancel?.()
    for (const run of this.runs.values()) await this.drainWorkers(run, false)
    await this.ticking
    // Preserve run status for cold recovery; stop writers before releasing leases.
    const errors: string[] = []
    for (const run of this.runs.values()) errors.push(...await this.drainWorkers(run, false))
    if (errors.length) throw new Error(`Shutdown incomplete; repository leases retained: ${errors.join('; ')}`)
    await this.store.dispose()
  }
  private async drainWorkers(run: Run, cancel: boolean): Promise<string[]> {
    const errors: string[] = []
    await Promise.all(run.tasks.filter(t => !TERMINAL.has(t.status)).map(async task => {
      try {
        await this.runtime.stop(task.sessionId)
        if (cancel) { task.status = 'cancelled'; this.phase(task, 'blocked', 'Stopped by user'); task.finishedAt = now() }
      } catch (error) { const message = `${task.ticket.id}: ${String(error)}`; task.error = `Shutdown incomplete: ${message}`; errors.push(message) }
    }))
    if (errors.length) run.error = `Shutdown incomplete; repository ownership retained: ${errors.join('; ')}`
    else if (run.error?.startsWith('Shutdown incomplete')) delete run.error
    await this.save(run)
    return errors
  }
}
