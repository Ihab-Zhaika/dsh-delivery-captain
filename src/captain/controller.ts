import { randomUUID, createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import type { FollowupInput, Phase, Question, Run, RunConfig, Task, TicketProvider, WorkerRuntime } from './types.ts'
import { eligibility, validateConfig, taskDeliveryConfig, phaseDurations } from './scheduler.ts'
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
  private readonly stoppingRuns = new Set<string>()
  private ticking?: Promise<void>
  private readonly runTicks = new Map<string, Promise<void>>()
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
      if(isStopped(run)&&!run.stoppedAt){run.stoppedAt=run.updatedAt;groupingChanged=true}
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
  /** Session projection is separate from internal ownership lookup. */
  view(sessionId: string) {
    const run = this.state(sessionId)
    if (!run) return { role: 'idle' as const, run: null, coordinatorSessionId: null }
    if (run.captainSessionId === sessionId) return { role: 'coordinator' as const, run, coordinatorSessionId: sessionId }
    const tasks = run.tasks.filter(t => t.sessionId === sessionId)
    return { role: 'worker' as const, coordinatorSessionId: run.captainSessionId,
      run: { ...run, tasks, tickets: tasks.map(t => t.ticket), questions: run.questions.filter(q => tasks.some(t => t.id === q.taskId)) } }
  }
  async sessionView(sessionId:string) {
    const seen=new Set<string>();let id:string|null=sessionId
    while(id&&!seen.has(id)&&seen.size<64) {
      seen.add(id);const view=this.view(id)
      if(view.run)return id===sessionId?view:{...view,role:'worker' as const,...view.role==='coordinator'?{run:{...view.run,tasks:[],tickets:[],questions:[]}}:{}}
      id=await this.runtime.parentSession?.(id)??null
    }
    const workspace=await this.runtime.workspacePath?.(sessionId)
    if(workspace) {
      const canonical=(path:string)=>process.platform==='win32'?resolve(path).toLowerCase():resolve(path)
      for(const run of this.runs.values()) {
        const task=run.tasks.find(t=>canonical(t.worktree)===canonical(workspace))
        if(task)return this.view(task.sessionId)
      }
    }
    return this.view(sessionId)
  }
  all(): Run[] { return [...this.runs.values()] }
  private async save(run: Run): Promise<void> { run.updatedAt = now(); await this.store.save(run) }
  private async endLoop(run:Run):Promise<void> {
    try{await this.runtime.coordinatorLoop?.(run,'stop');delete run.coordinatorLoopError}
    catch(error){run.coordinatorLoopError=`Coordinator loop completion failed: ${String(error)}`}
  }
  private captain(sessionId: string): Run {
    if(this.startingSessions.has(sessionId))throw new Error('Run is still starting')
    const run = this.runs.get(sessionId)
    if (!run) throw new Error('Session is not an explicitly activated captain')
    return run
  }
  private worker(sessionId: string): { run: Run; task: Task } {
    for (const run of this.runs.values()) {
      const task = run.tasks.find(t => t.sessionId === sessionId && !TERMINAL.has(t.status) && t.status !== 'parked')
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
      let pendingRun:Run|undefined
      try {
        await this.providerFactory(config).preflight()
        await this.runtime.preflight(config)
        const run: Run = { version: 1, id: randomUUID(), captainSessionId: sessionId, config, status: 'paused', createdAt: now(), updatedAt: now(), tasks: [], tickets: [], questions: [] }
        pendingRun=run;this.runs.set(sessionId,run)
        await this.runtime.coordinatorLoop?.(run,'start')
        run.status='running';await this.save(run)
        return run
      } catch (error) {
        if(pendingRun){pendingRun.status='stopped';try{await this.runtime.coordinatorLoop?.(pendingRun,'stop')}catch{/* Preserve original admission error. */};this.runs.delete(sessionId)}
        await this.store.release(key); throw error
      }
    } finally { this.starting.delete(key); this.startingSessions.delete(sessionId) }
  }

  async control(sessionId: string, action: string, parallelism?: number): Promise<Run> {
    const run = this.captain(sessionId)
    const revision=['loop','resume','pause','drain','stop'].includes(action)?run.coordinatorRevision=(run.coordinatorRevision??0)+1:run.coordinatorRevision
    if (action === 'parallelism') run.config = validateConfig({ ...run.config, parallelism })
    else if (action === 'pause') {run.status = 'paused';await this.runtime.coordinatorLoop?.(run,'pause')}
    else if (action === 'drain') run.status = 'draining'
    else if (action === 'resume') {
      if ([...this.runs.values()].some(r => r.id !== run.id && r.status !== 'stopped' && repositoryKey(r.config) === repositoryKey(run.config))) throw new Error('Repository already owned by a different run')
      await this.store.acquire(repositoryKey(run.config))
      await this.providerFactory(run.config).preflight()
      await this.runtime.preflight(run.config)
      if(run.coordinatorRevision!==revision||this.disposed)throw new Error('Run changed while validating resumption')
      await this.runtime.coordinatorLoop?.(run,'resume')
      if(run.coordinatorRevision!==revision||this.disposed)throw new Error('Run changed while activating resumption')
      run.status = 'running'
      delete run.stoppedAt
      for (const t of run.tasks.filter(t => t.status === 'cancelled'&&run.config.milestones.includes(t.ticket.milestone)&&(!run.config.ticketIds||run.config.ticketIds.includes(t.ticket.id)))) { t.status = 'blocked'; t.resumeRequested = true; delete t.finishedAt; t.recoveryAttempts = 0; delete t.lastWakeAt }
    } else if (action === 'stop') {
      this.stoppingRuns.add(run.id)
      try {
      run.status = 'stopped'
      await this.endLoop(run)
      this.activeProviders.get(run.id)?.cancel?.()
      // Commit revocation before awaiting cancellation: late worker reports cannot mutate delivery.
      await this.save(run)
      await this.drainWorkers(run, false)
      // A worker may still be inside create/start. Drain that operation before cancelling the final roster.
      await this.runTicks.get(run.id)
      const shutdownErrors = await this.drainWorkers(run, true)
      run.stoppedAt=now()
      await this.save(run)
      // A tick may still be finishing an external call. Keep the repository lease until it quiesces.
      if (!shutdownErrors.length) await this.store.release(repositoryKey(run.config))
      }finally{this.stoppingRuns.delete(run.id)}
    } else if(action==='loop') {
      if(run.status!=='running')throw new Error('Resume the run before starting the coordinator loop')
      await this.runtime.coordinatorLoop?.(run,'resume')
    } else throw new Error('Unknown captain control action')
    await this.save(run)
    return run
  }

  async configure(sessionId:string,raw:unknown):Promise<Run> {
    const run=this.captain(sessionId)
    if(this.disposed||run.status!=='stopped'||this.stoppingRuns.has(run.id))throw new Error('Configuration can only be saved after the run has fully stopped')
    const config=validateConfig(raw)
    for(const key of ['provider','repository','workspace','remote','targetBranch','organization','project'] as const) {
      if(config[key]!==run.config[key])throw new Error(`${key} is part of this run identity; use a new coordinator session to change it`)
    }
    const revision=run.coordinatorRevision
    for(const task of run.tasks)if(task.status!=='merged'&&await this.runtime.isRunning(task.sessionId))throw new Error('A worker is still executing; finish Stop before saving configuration')
    if(this.disposed||run.status!=='stopped'||this.stoppingRuns.has(run.id)||run.coordinatorRevision!==revision)throw new Error('Run changed while validating stopped configuration')
    // Preserve original gates and policies even for legacy tasks created before snapshots.
    for(const task of run.tasks)task.assignmentConfig??=structuredClone(run.config)
    run.stoppedAt??=run.updatedAt
    run.coordinatorRevision=(run.coordinatorRevision??0)+1
    run.config=config;await this.save(run)
    return run
  }

  async wait(sessionId:string):Promise<void> {
    const run=this.captain(sessionId)
    if(run.status!=='running')throw new Error('Only a running coordinator may wait for events')
    if(run.questions.some(q=>!q.answer))throw new Error('Answer pending worker questions before waiting')
    await this.runtime.coordinatorLoop?.(run,'wait');await this.save(run)
  }
  loopState(sessionId:string) {
    const run=this.state(sessionId)
    return run?this.runtime.coordinatorLoopState?.(run)??{status:'not-started' as const}:null
  }

  async report(sessionId: string, report: { phase: Phase; ready?: boolean; blocked?: boolean; note?: string }): Promise<Task> {
    const { run, task } = this.worker(sessionId)
    if (!PHASES.includes(report.phase) || report.phase === 'complete' || report.phase === 'parked') throw new Error('Only the controller can complete or park a task')
    if (report.ready && report.blocked) throw new Error('A task cannot be ready and blocked together')
    task.transitionVersion=(task.transitionVersion??0)+1
    delete task.resumeRequested
    delete task.idleCheckpointAt
    this.phase(task, report.phase, report.note)
    if (report.ready) { delete task.blockedSince; task.status = 'ready'; this.phase(task, 'waiting', 'Queued for independent verification and merge') }
    else if (report.blocked) { task.blockedSince ??= now(); task.status = 'blocked'; task.error = report.note ?? 'Worker blocked'; task.lastWakeAt = now(); task.executionActive = true }
    else if (!['blocked','waiting'].includes(report.phase)) { task.status = 'running'; delete task.blockedSince }
    await this.save(run)
    if (report.blocked) await this.notifyBlocker(run, task)
    return task
  }

  async question(sessionId: string, question: string): Promise<Question> {
    const { run, task } = this.worker(sessionId)
    if (!question.trim() || question.length > 20000) throw new Error('Question must be 1–20000 characters')
    const duplicate = run.questions.find(q => q.taskId === task.id && q.question === question)
    if (duplicate) return duplicate
    const item: Question = { id: randomUUID(), taskId: task.id, question, createdAt: now() }
    run.questions.push(item); await this.save(run)
    await this.notifyQuestion(run, item)
    return item
  }

  async answer(sessionId: string, questionId: string, answer: string, action: 'resume' | 'wait' = 'resume'): Promise<Question> {
    const run = this.captain(sessionId)
    if (isStopped(run)) throw new Error('Captain run stopped')
    const q = run.questions.find(q => q.id === questionId)
    if (!q || !answer.trim() || answer.length > 30000) throw new Error('Invalid question or answer')
    if (action !== 'resume' && action !== 'wait') throw new Error('Invalid answer action')
    if (q.answer === answer && q.action === action && (q.deliveredAt||q.recordedAt)) {
      const task=run.tasks.find(t=>t.id===q.taskId)
      if(action==='wait'&&task?.status==='blocked'&&task.resumeRequested){delete task.resumeRequested;task.transitionVersion=(task.transitionVersion??0)+1;await this.save(run)}
      return q
    }
    q.answer = answer; q.action = action; q.answeredAt = now(); delete q.deliveredAt; delete q.recordedAt; await this.save(run)
    await this.deliverAnswer(run, q)
    return q
  }

  private async deliverAnswer(run: Run, q: Question): Promise<void> {
    const task = run.tasks.find(t => t.id === q.taskId)
    if (!task || TERMINAL.has(task.status) || isStopped(run)) return
    if(task.status==='ready')return
    if(task.status==='parked') { q.recordedAt=now(); task.waitingDecision=q.answer; await this.save(run); return }
    const diagnosticVersion=task.transitionVersion
    if(task.status==='blocked')await this.runtime.assertCaptainDiagnostics?.(run)
    if(isStopped(run)||this.disposed||TERMINAL.has(task.status)||['ready','parked'].includes(task.status)||task.transitionVersion!==diagnosticVersion)return
    if(q.action==='wait'&&task.status==='blocked'){delete task.resumeRequested;task.transitionVersion=(task.transitionVersion??0)+1;task.waitingDecision=q.answer;q.recordedAt=now();await this.save(run);return}
    if (task.status === 'blocked' && !task.executionActive && this.activeCount(run) >= run.config.parallelism) return
    delete task.resumeRequested
    const previousStatus=task.status
    const version=task.transitionVersion=(task.transitionVersion??0)+1
    task.status = 'running'; await this.save(run)
    await this.runtime.send(task.sessionId, `Captain answer to ${q.id}: ${q.answer}${q.action==='wait'?'\nDecision: wait. Preserve the existing team and execution holds; do not retry unchanged work. Report waiting/blocked and yield when no independent safe work remains.':''}`,`answer:${q.id}:${createHash('sha256').update(JSON.stringify([q.answer,q.action])).digest('hex')}`)
    if (isStopped(run) || this.disposed) { await this.runtime.stop(task.sessionId); return }
    if(!TERMINAL.has(task.status)&&task.transitionVersion===version){
      if(q.action==='wait'){task.status=previousStatus;task.executionActive=true;if(previousStatus!=='blocked')this.phase(task,'waiting')}
    else {this.phase(task,'analysis');delete task.error;delete task.idleCheckpointAt;delete task.waitingDecision}
    }
    q.deliveredAt = now(); task.lastWakeAt = now(); await this.save(run)
  }

  async message(sessionId: string, taskId: string, text: string, action: 'resume' | 'wait' = 'resume'): Promise<void> {
    const run = this.captain(sessionId), task = run.tasks.find(t => t.id === taskId)
    if (!task || TERMINAL.has(task.status) || isStopped(run)) throw new Error('Task is not active')
    if(task.status==='ready')throw new Error('Task is already owned by controller verification; guidance cannot interrupt it')
    if (!text.trim() || text.length > 30000) throw new Error('Invalid worker message')
    if(action!=='resume'&&action!=='wait')throw new Error('Invalid guidance action')
    if(task.status==='parked') {
      if(action==='resume')throw new Error('Task is parked; use explicit task resumption with changed prerequisite evidence')
      task.waitingDecision=text;await this.save(run);return
    }
    const hash=createHash('sha256').update(JSON.stringify([text.trim(),action,task.blockerFingerprint])).digest('hex')
    if(task.lastGuidanceHash===hash){
      if(action==='wait'&&task.status==='blocked'&&task.resumeRequested){delete task.resumeRequested;task.transitionVersion=(task.transitionVersion??0)+1;await this.save(run)}
      return
    }
    const diagnosticVersion=task.transitionVersion
    if(task.status==='blocked')await this.runtime.assertCaptainDiagnostics?.(run)
    if(isStopped(run)||this.disposed||TERMINAL.has(task.status)||['ready','parked'].includes(task.status)||task.transitionVersion!==diagnosticVersion)throw new Error('Task changed while validating diagnostic evidence')
    if(action==='wait'&&task.status==='blocked'){delete task.resumeRequested;task.transitionVersion=(task.transitionVersion??0)+1;task.waitingDecision=text;task.lastGuidanceHash=hash;await this.save(run);return}
    if (task.status === 'blocked' && !task.executionActive && this.activeCount(run) >= run.config.parallelism) throw new Error('No execution slot available; answer will need to wait')
    delete task.resumeRequested
    const previousStatus=task.status
    const version=task.transitionVersion=(task.transitionVersion??0)+1
    task.status = 'running'; await this.save(run)
    await this.runtime.send(task.sessionId, `Captain guidance: ${text}${action==='wait'?'\nDecision: wait. Preserve the current team and holds; do not retry unchanged work.':''}`,`guidance:${task.id}:${hash}`)
    if (isStopped(run) || this.disposed) { await this.runtime.stop(task.sessionId); return }
    task.lastGuidanceHash=hash;task.lastWakeAt=now()
    if(!TERMINAL.has(task.status)&&task.transitionVersion===version){
      if(action==='wait'){task.status=previousStatus;task.executionActive=true;if(previousStatus!=='blocked')this.phase(task,'waiting')}
      else{task.status='running';this.phase(task,'analysis');delete task.error;delete task.idleCheckpointAt;delete task.waitingDecision}
    }
    await this.save(run)
  }

  async resumeTask(sessionId: string, taskId: string, evidence: string, human = false): Promise<Task> {
    const run=this.captain(sessionId),task=run.tasks.find(t=>t.id===taskId)
    if(isStopped(run)||run.status!=='running'||!task||task.status!=='parked')throw new Error('Resume requires a running coordinator and parked task')
    if(!evidence.trim()||evidence.length>30000)throw new Error('Describe the changed prerequisite or explicit human resumption')
    if(task.executionActive||task.parkingError)throw new Error('Parking has not safely quiesced the worker')
    const version=task.transitionVersion
    if(!human)await this.runtime.assertCaptainDiagnostics?.(run)
    if(isStopped(run)||this.disposed||task.status!=='parked'||task.transitionVersion!==version)throw new Error('Task changed during resumption validation')
    task.transitionVersion=(task.transitionVersion??0)+1
    task.status='blocked';task.resumeRequested=true;task.waitingDecision=evidence;delete task.blockedSince;delete task.idleCheckpointAt
    this.phase(task,'waiting',`Explicit resumption: ${evidence}`);await this.save(run)
    return task
  }

  async followup(sessionId: string, input: FollowupInput): Promise<string> {
    const { run, task } = this.worker(sessionId)
    if (!input.title.trim() || !input.body.trim() || !run.config.milestones.includes(input.milestone) || !Array.isArray(input.predecessors) || input.predecessors.some(x => typeof x !== 'string')) throw new Error('Follow-up requires title, scope/acceptance body, configured milestone and predecessor IDs')
    const id = await this.providerFactory(run.config).createFollowup(task, input)
    if (!task.followups.includes(id)) task.followups.push(id)
    await this.save(run); return id
  }

  private activeCount(run: Run): number { return run.tasks.filter(t => ['starting','running','ready'].includes(t.status)||['blocked','parked'].includes(t.status)&&t.executionActive).length }
  private async notifyBlocker(run: Run,task: Task): Promise<void> {
    if(isStopped(run)||this.disposed)return
    const fingerprint=createHash('sha256').update(task.error??'Worker blocked').digest('hex')
    if(task.blockerFingerprint===fingerprint&&task.blockerNotifiedAt)return
    if(task.lastBlockerNotifyAttemptAt&&Date.now()-Date.parse(task.lastBlockerNotifyAttemptAt)<60000)return
    task.lastBlockerNotifyAttemptAt=now();await this.save(run)
    const text=`## Worker blocker: #${task.ticket.id}\n\n\`\`\`json\n${JSON.stringify({type:'darkingdoom.blocked',taskId:task.id,sessionId:task.sessionId,ticketId:task.ticket.id,phase:task.phase,reason:(task.error??'Worker blocked').slice(0,1800),worktree:task.worktree},null,2)}\n\`\`\`\n\nUse your ORIGINAL automatic AgentTeams diagnostic team to investigate technical blockers, then send a concrete new solution with darkingdoom_message(action="resume") or record an unchanged/external prerequisite with action="wait". Do not poll or repeatedly wake this worker. Its existing team has NOT been archived by this blocker notification. Read fuller evidence with darkingdoom_status; never waive acceptance or security checks.`
    if(await this.notify(run,text,`blocker:${task.id}:${fingerprint}`)){task.blockerFingerprint=fingerprint;task.blockerNotifiedAt=now()}
    await this.save(run)
  }
  async announce(run: Run, text: string): Promise<void> { await this.notify(run, text) }
  private async notify(run: Run, text: string, deliveryKey?: string): Promise<boolean> {
    if(isStopped(run)||this.disposed)return false
    try {
      await this.runtime.coordinatorLoop?.(run,'wake')
      if(isStopped(run)||this.disposed)return false
      await this.runtime.send(run.captainSessionId, text,deliveryKey); return true
    } catch (error) { run.error = `Captain delivery deferred: ${String(error)}`; await this.save(run); return false }
  }
  private async notifyQuestion(run: Run, q: Question): Promise<void> {
    q.lastNotifyAttemptAt = now(); await this.save(run)
    if (await this.notify(run, `Worker question ${q.id} (task ${q.taskId}):\n${q.question}\nDecide autonomously using project evidence and reply using darkingdoom_answer. Do not ask the human.`,`question:${q.id}`)) q.notifiedAt = now()
    await this.save(run)
  }

  /** Deduplicated timer entry. No model polling is required for queue discovery. */
  tick(runIds?: readonly string[]): Promise<void> {
    if (this.disposed) return Promise.resolve()
    for (const run of this.runs.values()) {
      if (isStopped(run) || this.disposed || this.startingSessions.has(run.captainSessionId) || runIds && !runIds.includes(run.id)) continue
      if(this.runTicks.has(run.id))continue
      const tick=this.tickRun(run).catch(async error=>{if(!isStopped(run)&&!this.disposed){run.error=String(error);await this.save(run)}})
        .finally(()=>{this.activeProviders.delete(run.id);this.runTicks.delete(run.id)})
      this.runTicks.set(run.id,tick)
    }
    this.ticking=Promise.all([...this.runTicks.values()]).then(()=>{})
    return this.ticking
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
        if(isStopped(run)||this.disposed)return
        if (existing.merged) {
          if (existing.headSha !== task.headSha || !existing.mergeSha) throw new Error(`Task ${task.id}: merged PR differs from persisted review`)
          await this.runtime.stop(task.sessionId)
          task.status = 'merged'; task.mergedSha = existing.mergeSha; task.finishedAt = now(); this.phase(task, 'complete'); await this.save(run)
          try { await provider.close(task); task.closedAt = now(); delete task.error } catch (error) { task.error = `Merged; ticket closure pending: ${String(error)}` }
          await this.save(run); continue
        }
      }
      if(task.status==='blocked'&&!task.resumeRequested) {
        task.blockedSince ??= [...task.phases].reverse().find(p=>p.phase==='blocked')?.at ?? now()
        if(Date.now()-Date.parse(task.blockedSince)>3600000) {
          task.transitionVersion=(task.transitionVersion??0)+1;task.status='parked';task.parkedAt=now();task.parkReason=task.error??'Unresolved blocker'
          task.executionActive=true;delete task.resumeRequested;this.phase(task,'parked','Blocked over one hour; preserved for prerequisite resolution');await this.save(run)
        }
      }
      if(task.status==='parked') {
        if(task.executionActive||task.parkingError) {
          try {await this.runtime.stop(task.sessionId,'shutdown');task.executionActive=false;delete task.parkingError}
          catch(error){task.parkingError=String(error)}
          await this.save(run)
        }
        continue
      }
      if (Date.now() - Date.parse(task.startedAt) - (phaseDurations(task).parked??0) > taskDeliveryConfig(task,run.config).maxTaskMinutes * 60000) {
        await this.runtime.stop(task.sessionId); task.status = 'failed'; task.error = 'Task time budget exhausted'; task.finishedAt = now(); this.phase(task, 'blocked', task.error); await this.save(run); continue
      }
      if (task.status === 'ready') { await this.integrate(run, task, provider); continue }
      if (task.status === 'blocked') {
        const version=task.transitionVersion
        const executing=await this.runtime.isRunning(task.sessionId)
        if(isStopped(run)||this.disposed)return
        if(task.transitionVersion!==version)continue
        task.executionActive=executing
        if (run.status === 'running' && task.resumeRequested && this.activeCount(run) < run.config.parallelism) {
          delete task.resumeRequested; task.status = 'starting'; await this.save(run)
          await this.launch(run, task, provider); continue
        }
        await this.notifyBlocker(run,task)
        continue
      }
      if (task.status === 'starting') { await this.launch(run, task, provider); continue }
      if (task.phase!=='waiting'&&!run.questions.some(q=>q.taskId===task.id&&!q.answer)&&!await this.runtime.isRunning(task.sessionId) && Date.now() - Date.parse(task.lastWakeAt ?? task.startedAt) > 30000) {
        if (task.idleCheckpointAt) { task.status = 'blocked'; task.blockedSince ??= now(); task.error ??= 'Worker is idle after one recovery checkpoint; diagnose its team and pending work';this.phase(task,'blocked',task.error);await this.notifyBlocker(run,task) }
        else {
          task.idleCheckpointAt=now();task.recoveryAttempts = (task.recoveryAttempts ?? 0) + 1; task.lastWakeAt = now(); await this.save(run)
          await this.runtime.start(task, run)
        }
      }
    }
    for (const q of run.questions) {
      if (isStopped(run)) return
      if (q.answer && !q.deliveredAt && !q.recordedAt) await this.deliverAnswer(run, q)
      if (!q.answer && !q.notifiedAt && Date.now() - Date.parse(q.lastNotifyAttemptAt ?? q.createdAt) >= 60000) await this.notifyQuestion(run, q)
    }
    // Admission counts persisted attempts, including blocked/failed setup. A trial
    // must never substitute another ticket or reset its cap after a restart.
    if (run.config.maxTickets > 0 && run.tasks.length >= run.config.maxTickets && run.tasks.every(t => TERMINAL.has(t.status) && (t.status !== 'merged' || t.closedAt))) {
      run.status = 'stopped';run.stoppedAt=now(); await this.endLoop(run);await this.save(run); await this.store.release(repositoryKey(run.config)); return
    }
    // A parked blocker needs a new captain decision, not a timed assignment replay.
    if (run.status === 'draining' && this.activeCount(run) === 0) {
      run.status = 'stopped';run.stoppedAt=now(); await this.endLoop(run);await this.save(run); await this.store.release(repositoryKey(run.config)); return
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
      const task: Task = { id, ticket, assignmentConfig:structuredClone(run.config), attempt, sessionId: randomUUID(), branch, worktree: join(dirname(run.config.workspace), '.delivery-worktrees', repoHash, id), baseSha: '', status: 'starting', phase: 'setup', phases: [{ phase: 'setup', at: startedAt }], startedAt, reviewRounds: 0, followups: [] }
      run.tasks.push(task); await this.save(run)
      await this.launch(run, task, provider)
    }
    await this.save(run)
  }

  private async launch(run: Run, task: Task, provider: TicketProvider): Promise<void> {
    try {
      await provider.claim(task.ticket, run.id)
      if (isStopped(run) || this.disposed) return
      await this.runtime.prepare(task, taskDeliveryConfig(task,run.config)); await this.save(run)
      if (isStopped(run) || this.disposed) return
      await this.runtime.start(task, run)
      if (isStopped(run) || this.disposed) { await this.runtime.stop(task.sessionId); return }
      task.status = 'running'; delete task.blockedSince; task.lastWakeAt = now(); this.phase(task, 'analysis')
      if(run.coordinatorWaiting)await this.notify(run,`Ticket #${task.ticket.id} is executing in dedicated session ${task.sessionId}; read current delivery status before guiding it.`,`assigned:${task.id}`)
    } catch (error) { task.status = 'blocked'; task.blockedSince ??= now(); task.error = String(error); task.lastWakeAt = now(); this.phase(task, 'blocked', task.error) }
    await this.save(run)
  }

  private async integrate(run: Run, task: Task, provider: TicketProvider): Promise<void> {
    try {
      await this.runtime.stop(task.sessionId)
      if (isStopped(run) || this.disposed) return
      const previous = task.reviewHistory?.at(-1)
      const verification=taskDeliveryConfig(task,run.config)
      const cached = previous?.passed && await this.runtime.isReviewCurrent?.(task, verification, previous)
      if (!cached) { this.phase(task, 'testing'); await this.save(run) }
      const review = cached && previous ? previous : await this.runtime.review(task, verification, async phase => { if (isStopped(run) || this.disposed) throw new Error('Run stopped'); this.phase(task, phase); await this.save(run) })
      if (!cached) (task.reviewHistory ??= []).push({ ...review, at: now() })
      await this.save(run)
      if (isStopped(run) || this.disposed) return
      if (!review.passed) { await this.repair(run, task, review.findings.join('\n') || review.report || 'Verification/review failed'); return }
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
    const repairLimit=taskDeliveryConfig(task,run.config).maxRepairRounds
    if (task.reviewRounds >= repairLimit) {
      task.status = 'blocked'; task.blockedSince ??= now(); task.recoveryAttempts = repairLimit; this.phase(task, 'blocked', 'Repair budget exhausted'); await this.save(run)
      await this.notify(run, `Ticket ${task.ticket.id} exhausted repair rounds. Evidence: ${reason}. Keep it blocked unless you have a specific new solution; no bypass of review or scope is permitted.`)
      return
    }
    task.reviewRounds++; task.status = 'running'; task.lastWakeAt = now(); this.phase(task, 'repair', reason); await this.save(run)
    await this.runtime.send(task.sessionId, `Delivery gate failed (round ${task.reviewRounds}):\n${reason}\nUse the installed ORIGINAL AgentTeams to investigate and repair these findings with approval="automatic". Rerun verification, commit fixes, and report ready. Do not defer current acceptance failures to follow-ups or bypass gates.`)
  }

  async dispose(): Promise<void> {
    this.disposed = true
    for(const run of this.runs.values())run.coordinatorRevision=(run.coordinatorRevision??0)+1
    for(const run of this.runs.values())try{await this.runtime.coordinatorLoop?.(run,'shutdown')}catch(error){run.coordinatorLoopError=String(error)}
    for (const provider of this.activeProviders.values()) provider.cancel?.()
    for (const run of this.runs.values()) await this.drainWorkers(run, false,'shutdown')
    await this.ticking
    // Preserve run status for cold recovery; stop writers before releasing leases.
    const errors: string[] = []
    for (const run of this.runs.values()) errors.push(...await this.drainWorkers(run, false,'shutdown'))
    if (errors.length) throw new Error(`Shutdown incomplete; repository leases retained: ${errors.join('; ')}`)
    await this.store.dispose()
  }
  private async drainWorkers(run: Run, cancel: boolean,reason: 'stop'|'shutdown'='stop'): Promise<string[]> {
    const errors: string[] = []
    await Promise.all(run.tasks.filter(t => !TERMINAL.has(t.status)).map(async task => {
      try {
        await this.runtime.stop(task.sessionId,reason)
        if (cancel && task.status!=='parked') { task.status = 'cancelled'; this.phase(task, 'blocked', 'Stopped by user'); task.finishedAt = now() }
        if(task.status==='parked'){task.executionActive=false;delete task.parkingError}
      } catch (error) { const message = `${task.ticket.id}: ${String(error)}`; task.error = `Shutdown incomplete: ${message}`; errors.push(message) }
    }))
    if (errors.length) run.error = `Shutdown incomplete; repository ownership retained: ${errors.join('; ')}`
    else if (run.error?.startsWith('Shutdown incomplete')) delete run.error
    await this.save(run)
    return errors
  }
}
