import { randomUUID, createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import type { FollowupInput, Phase, Question, Run, RunConfig, Task, TicketProvider, WorkerRuntime } from './types.ts'
import { eligibility, validateConfig, taskDeliveryConfig, taskDeadline, dependencyBlocker } from './scheduler.ts'
import { RunStore } from './store.ts'

const TERMINAL = new Set<Task['status']>(['merged', 'failed', 'cancelled'])
const PHASES: Phase[] = ['setup','analysis','implementation','testing','review','repair','integration','waiting','blocked','complete']
const now = (): string => new Date().toISOString()
const isStopped = (run: Run): boolean => run.status === 'stopped'
class DiagnosticAnswerDeferred extends Error {}
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
  private readonly ownedTicks = new Map<string,Promise<void>>()
  private readonly ownedProviders = new Map<string,TicketProvider>()
  private readonly idleRecoveries = new Map<string,Promise<void>>()
  private readonly resumeDispatches = new Map<string, Promise<void>>()
  private readonly resumeProviders = new Map<string, Set<TicketProvider>>()
  private readonly resumingTasks = new Set<string>()
  private readonly dependencyQuiescences = new Map<string, Promise<void>>()
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
      for (const t of run.tasks.filter(t => t.status === 'cancelled'&&(run.config.milestones.includes(t.ticket.milestone)||run.config.includeUnmilestoned&&!t.ticket.milestone||run.config.includeRequiredPredecessors&&eligibility(run.tickets,run.config.milestones,[],run.config).some(row=>row.ticketId===t.ticket.id&&row.scope==='predecessor'))&&(!run.config.ticketIds||run.config.ticketIds.includes(t.ticket.id)))) { t.status = 'blocked'; t.budgetStartedAt=now(); t.phases.push({phase:t.phase,at:now(),note:'Explicit run Resume starts a fresh bounded execution window; previous elapsed/history and assignment gates retained.'});t.resumeRequested = true; delete t.finishedAt; t.recoveryAttempts = 0; delete t.lastWakeAt }
    } else if (action === 'stop') {
      this.stoppingRuns.add(run.id)
      try {
      run.status = 'stopped'
      await this.endLoop(run)
      this.activeProviders.get(run.id)?.cancel?.()
      this.ownedProviders.get(run.id)?.cancel?.()
      for(const provider of this.resumeProviders.get(run.id)??[])provider.cancel?.()
      // Commit revocation before awaiting cancellation: late worker reports cannot mutate delivery.
      await this.save(run)
      await this.drainWorkers(run, false)
      await this.resumeDispatches.get(run.id)
      await this.ownedTicks.get(run.id)
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
    if(action==='resume')await this.notifyPolicy(run)
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
    this.updateReviewBudget(run,config,true);this.recordPolicyNotice(run,config)
    run.config=config;await this.save(run)
    return run
  }

  async wait(sessionId:string):Promise<void> {
    const run=this.captain(sessionId)
    if(run.status!=='running')throw new Error('Only a running coordinator may wait for events')
    if(run.questions.some(q=>!q.answer))throw new Error('Answer pending worker questions before waiting')
    await this.runtime.coordinatorLoop?.(run,'wait');await this.save(run)
  }

  async updateMilestones(sessionId:string,milestones:unknown,expectedRevision?:number):Promise<Run> {
    const run=this.captain(sessionId)
    if(this.disposed||!['running','paused'].includes(run.status)||expectedRevision!==undefined&&run.coordinatorRevision!==expectedRevision)throw new Error('Milestone scope needs the active coordinator; run changed during validation')
    const updated=validateConfig({...run.config,milestones})
    for(const task of run.tasks)task.assignmentConfig??=structuredClone(run.config)
    run.coordinatorRevision=(run.coordinatorRevision??0)+1
    run.config=updated;await this.save(run)
    return run
  }
  async updatePolicy(sessionId:string,raw:unknown,expectedRevision?:number):Promise<Run> {
    const run=this.captain(sessionId)
    if(this.disposed||!['running','paused'].includes(run.status)||expectedRevision!==undefined&&run.coordinatorRevision!==expectedRevision)throw new Error('Policy needs the active coordinator; run changed during validation')
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid intake/review policy')
    const fields=['includeUnmilestoned','includeRequiredPredecessors','ocrMaxTokensBudget']
    const values=raw as Record<string,unknown>
    if(!Object.keys(values).length||Object.keys(values).some(key=>!fields.includes(key)))throw new Error('Only intake scope and OCR budget policy may change here')
    const updated=validateConfig({...run.config,...values})
    this.updateReviewBudget(run,updated,'ocrMaxTokensBudget' in values)
    run.coordinatorRevision=(run.coordinatorRevision??0)+1
    this.recordPolicyNotice(run,updated);run.config=updated
    await this.save(run);await this.notifyPolicy(run);return run
  }
  private updateReviewBudget(run:Run,config:RunConfig,explicit:boolean):void {
    for(const task of run.tasks){
      task.assignmentConfig??=structuredClone(run.config)
      if(explicit&&task.status!=='merged'&&task.assignmentConfig.ocrMaxTokensBudget!==config.ocrMaxTokensBudget){
        const previous=task.assignmentConfig.ocrMaxTokensBudget??'CLI/worker setting'
        task.assignmentConfig={...task.assignmentConfig,ocrMaxTokensBudget:config.ocrMaxTokensBudget}
        task.phases.push({phase:task.phase,at:now(),note:`Explicit review policy: ${previous} -> ${config.ocrMaxTokensBudget} tokens per independent OCR session. No shared pool; previous reviews/history and all other assignment gates retained.`})
      }
    }
  }
  private recordPolicyNotice(run:Run,config:RunConfig):void {
    const fields=['includeUnmilestoned','includeRequiredPredecessors','ocrMaxTokensBudget'] as const
    if(!fields.some(key=>run.config[key]!==config[key]))return
    run.policyNotice={revision:run.coordinatorRevision??0,text:`Owner updated intake/review policy: ${JSON.stringify(Object.fromEntries(fields.map(key=>[key,config[key]])))}. Each independent OCR review session/invocation has its OWN ${config.ocrMaxTokensBudget??1_000_000} token ceiling; no shared pool across workers, members, controller or run. This explicit policy supersedes previous ad hoc lower review-budget guidance. Existing assignments receive current policy on their next legitimate message; do not wake workers merely to announce a setting. Use completed original diagnostics and this changed budget to recover budget-blocked reviews within capacity. Required predecessors may be scheduled outside root milestone/query filters only when enabled; explicit trial allowlists remain hard limits. Do not invent milestones or waive complete exact-head review, CI, acceptance, security, ownership or dependency proof. Preserve all teams/worktrees/history, and keep unchanged external blockers parked.`}
  }
  private async notifyPolicy(run:Run):Promise<void> {
    const notice=run.policyNotice
    if(run.status!=='running'||!notice||notice.deliveredAt||this.disposed)return
    if(await this.notify(run,notice.text,`policy:${run.id}:${notice.revision}`,()=>run.status==='running'&&run.policyNotice===notice)&&run.policyNotice===notice){notice.deliveredAt=now();await this.save(run)}
  }
  loopState(sessionId:string) {
    const run=this.state(sessionId)
    return run?this.runtime.coordinatorLoopState?.(run)??{status:'not-started' as const}:null
  }

  async report(sessionId: string, report: { phase: Phase; ready?: boolean; blocked?: boolean; note?: string }): Promise<Task> {
    const { run, task } = this.worker(sessionId)
    if (!PHASES.includes(report.phase) || report.phase === 'complete' || report.phase === 'parked') throw new Error('Only the controller can complete or park a task')
    const blocked=report.blocked||report.phase==='blocked'
    if (report.ready && blocked) throw new Error('A task cannot be ready and blocked together')
    if(task.dependencyBlocked) {
      task.phases.push({phase:task.phase,at:now(),note:`Report retained during dependency hold; requested ${report.phase}${report.ready?' ready':''}: ${report.note??''}`});await this.save(run);return task
    }
    task.transitionVersion=(task.transitionVersion??0)+1
    delete task.resumeRequested
    delete task.idleCheckpointAt
    this.phase(task, report.phase, report.note)
    if (report.ready) { delete task.blockedSince; task.status = 'ready'; this.phase(task, 'waiting', 'Queued for independent verification and merge') }
    else if (blocked) { task.blockedSince ??= now(); task.status = 'blocked'; task.error = report.note ?? 'Worker blocked'; task.lastWakeAt = now(); task.executionActive = true }
    else if (!['blocked','waiting'].includes(report.phase)) { task.status = 'running'; delete task.blockedSince }
    await this.save(run)
    if (blocked) await this.notifyBlocker(run, task)
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
    q.answer = answer; q.action = action; q.answeredAt = now(); delete q.deliveredAt; delete q.recordedAt; delete q.deliveryError; await this.save(run)
    await this.deliverAnswer(run, q)
    return q
  }

  private async deliverAnswer(run: Run, q: Question): Promise<void> {
    const task = run.tasks.find(t => t.id === q.taskId)
    if (!task || TERMINAL.has(task.status) || isStopped(run)) return
    if(task.status==='ready')return
    if(task.status==='parked') { q.recordedAt=now(); delete q.deliveryError; task.waitingDecision=q.answer; await this.save(run); return }
    if(q.action!=='wait'&&await this.heldDependencyWake(run,task)){q.recordedAt=now();delete q.deliveryError;task.waitingDecision=q.answer;await this.save(run);return}
    const diagnosticVersion=task.transitionVersion
    if(task.status==='blocked')try{await this.runtime.assertCaptainDiagnostics?.(run)}catch(error){
      q.deliveryError=(error instanceof Error?error.message:String(error)).slice(0,4000);await this.save(run)
      throw new DiagnosticAnswerDeferred(q.deliveryError)
    }
    if(isStopped(run)||this.disposed||TERMINAL.has(task.status)||['ready','parked'].includes(task.status)||task.transitionVersion!==diagnosticVersion||this.dependencyQuiescences.has(task.id)||task.dependencyBlocked&&task.parkingError)return
    if(q.action==='wait'&&task.status==='blocked'){delete task.resumeRequested;task.transitionVersion=(task.transitionVersion??0)+1;task.waitingDecision=q.answer;q.recordedAt=now();delete q.deliveryError;await this.save(run);return}
    if (task.status === 'blocked' && !task.executionActive && this.activeCount(run) >= run.config.parallelism) return
    delete task.resumeRequested
    const previousStatus=task.status
    const version=task.transitionVersion=(task.transitionVersion??0)+1
    task.status = 'running'; await this.save(run)
    if(this.dependencyQuiescences.has(task.id)||task.dependencyBlocked&&task.parkingError)return
    await this.runtime.send(task.sessionId, `Captain answer to ${q.id}: ${q.answer}${q.action==='wait'?'\nDecision: wait. Preserve the existing team and execution holds; do not retry unchanged work. Report waiting/blocked and yield when no independent safe work remains.':''}`,`answer:${q.id}:${createHash('sha256').update(JSON.stringify([q.answer,q.action])).digest('hex')}`)
    if (isStopped(run) || this.disposed) { await this.runtime.stop(task.sessionId); return }
    if(!TERMINAL.has(task.status)&&task.transitionVersion===version){
      if(q.action==='wait'){task.status=previousStatus;task.executionActive=true;if(previousStatus!=='blocked')this.phase(task,'waiting')}
    else {this.phase(task,'analysis');delete task.error;delete task.idleCheckpointAt;delete task.waitingDecision}
    }
    q.deliveredAt = now(); delete q.deliveryError; task.lastWakeAt = now(); await this.save(run)
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
    if(action==='resume'&&await this.heldDependencyWake(run,task))throw new Error('Guidance not delivered: dependency prerequisites are unmet, unverified, or worker quiescence is incomplete')
    const diagnosticVersion=task.transitionVersion
    if(task.status==='blocked')await this.runtime.assertCaptainDiagnostics?.(run)
    if(isStopped(run)||this.disposed||TERMINAL.has(task.status)||['ready','parked'].includes(task.status)||task.transitionVersion!==diagnosticVersion||this.dependencyQuiescences.has(task.id)||task.dependencyBlocked&&task.parkingError)throw new Error('Task changed while validating diagnostic evidence')
    if(action==='wait'&&task.status==='blocked'){delete task.resumeRequested;task.transitionVersion=(task.transitionVersion??0)+1;task.waitingDecision=text;task.lastGuidanceHash=hash;await this.save(run);return}
    if (task.status === 'blocked' && !task.executionActive && this.activeCount(run) >= run.config.parallelism) throw new Error('No execution slot available; answer will need to wait')
    delete task.resumeRequested
    const previousStatus=task.status
    const version=task.transitionVersion=(task.transitionVersion??0)+1
    task.status = 'running'; await this.save(run)
    if(this.dependencyQuiescences.has(task.id)||task.dependencyBlocked&&task.parkingError)throw new Error('Guidance not delivered: dependency quiescence is pending')
    await this.runtime.send(task.sessionId, `Captain guidance: ${text}${action==='wait'?'\nDecision: wait. Preserve the current team and holds; do not retry unchanged work.':''}`,`guidance:${task.id}:${hash}`)
    if (isStopped(run) || this.disposed) { await this.runtime.stop(task.sessionId); return }
    task.lastGuidanceHash=hash;task.lastWakeAt=now()
    if(!TERMINAL.has(task.status)&&task.transitionVersion===version){
      if(action==='wait'){task.status=previousStatus;task.executionActive=true;if(previousStatus!=='blocked')this.phase(task,'waiting')}
      else{task.status='running';this.phase(task,'analysis');delete task.error;delete task.idleCheckpointAt;delete task.waitingDecision}
    }
    await this.save(run)
  }

  async resumeTask(sessionId: string, taskId: string, evidence: string, human = false, teamMemberLimit?:number): Promise<Task> {
    const run=this.captain(sessionId),task=run.tasks.find(t=>t.id===taskId)
    if(isStopped(run)||run.status!=='running'||!task||!(task.status==='parked'||task.status==='blocked'||human&&task.status==='running'&&task.phase==='waiting'))throw new Error('Resume requires a running coordinator and an idle blocked/parked task, or an explicit human retry of a waiting worker')
    if(!evidence.trim()||evidence.length>30000)throw new Error('Describe the changed prerequisite or explicit human resumption')
    const originalConfig=taskDeliveryConfig(task,run.config)
    if(teamMemberLimit!==undefined&&(!human||!Number.isInteger(teamMemberLimit)||teamMemberLimit<originalConfig.maxTeamMembers||teamMemberLimit>run.config.maxTeamMembers))throw new Error('A team resource override requires human resumption and a raised member limit within the configured run cap')
    if(task.parkingError||task.status==='parked'&&task.executionActive)throw new Error('Parking has not safely quiesced the worker')
    if(!human&&task.resumeRequested&&task.waitingDecision===evidence.trim())return task
    const version=task.transitionVersion
    const previousStatus=task.status
    if(task.status!=='parked'&&await this.runtime.isRunning(task.sessionId))throw new Error('Worker is already executing; retry was not duplicated')
    if(!human)await this.runtime.assertCaptainDiagnostics?.(run)
    if(isStopped(run)||this.disposed||run.status!=='running'||task.status!==previousStatus||task.transitionVersion!==version||task.parkingError||this.dependencyQuiescences.has(task.id))throw new Error('Task changed during resumption validation or has not quiesced')
    task.transitionVersion=(task.transitionVersion??0)+1
    if(human){task.pendingHumanRetry={at:now(),reason:evidence.trim(),previousBlocker:task.error??task.phases.at(-1)?.note};task.budgetStartedAt=now();task.phases.push({phase:task.phase,at:now(),note:'Explicit human task Resume authorizes one normal retry and starts a fresh bounded execution window; original elapsed/history and gate policies retained.'})}
    if(teamMemberLimit!==undefined) {
      task.assignmentConfig={...structuredClone(task.assignmentConfig??run.config),maxTeamMembers:teamMemberLimit}
      task.phases.push({phase:task.phase,at:now(),note:`Human resource override: team member limit ${originalConfig.maxTeamMembers} → ${teamMemberLimit}; verification, acceptance and other assignment policies unchanged.`})
    }
    task.status='blocked';task.executionActive=false;task.resumeRequested=true;task.waitingDecision=evidence;delete task.blockedSince;delete task.idleCheckpointAt
    this.phase(task,'waiting',`Explicit resumption: ${evidence}`);await this.save(run)
    await this.dispatchResumes(run)
    return task
  }

  /** Existing assignment transport never waits for the intake/discovery lane. */
  private dispatchResumes(run:Run):Promise<void> {
    const existing=this.resumeDispatches.get(run.id)
    if(existing)return existing
    const pending=this.dispatchResumeRun(run).finally(()=>{this.resumeDispatches.delete(run.id)})
    this.resumeDispatches.set(run.id,pending)
    return pending
  }

  private async dispatchResumeRun(run:Run):Promise<void> {
    // Reconcile both directions: older idle checks may have missed owned jobs.
    // Refresh reservations even when intake is unavailable.
    for(const task of run.tasks.filter(t=>t.status==='blocked'&&!t.parkingError&&(t.baseSha||t.workspaceId||t.assignmentDelivered||t.executionActive))) {
      if(this.disposed||run.status!=='running')return
      const version=task.transitionVersion
      let executing=true,confirmed=false
      try {executing=await this.runtime.isRunning(task.sessionId);confirmed=true}catch{/* Unknown jobs retain capacity. */}
      if(this.disposed||run.status!=='running')return
      if(task.status!=='blocked'||task.transitionVersion!==version)continue
      const idleHold=task.error==='Worker and owned members are idle while waiting; diagnose unmet work or prerequisites before resumption'
      if(confirmed&&executing&&idleHold&&!task.resumeRequested&&!task.dependencyBlocked){
        task.transitionVersion=(task.transitionVersion??0)+1;task.status='running';task.executionActive=true;delete task.blockedSince;delete task.error
        this.phase(task,'waiting','Confirmed owned native activity; corrected prior automatic idle observation without replaying work');await this.save(run)
      }else if(task.executionActive!==executing){task.executionActive=executing;await this.save(run)}
    }
    for(const task of run.tasks) {
      if(this.disposed||run.status!=='running')return
      // An uncertain reviewed PR must be reconciled before any writer is woken.
      // Incomplete initial setup still follows claim/fetch admission below.
      if(task.status!=='blocked'||!task.resumeRequested||!task.baseSha||task.parkingError||task.prUrl&&task.headSha&&task.reviewHistory?.some(r=>r.passed&&r.headSha===task.headSha))continue
      const version=task.transitionVersion
      const executing=await this.runtime.isRunning(task.sessionId)
      if(this.disposed||run.status!=='running')return
      if(task.status!=='blocked'||!task.resumeRequested||task.transitionVersion!==version)continue
      task.executionActive=executing
      if(executing||this.activeCount(run)>=run.config.parallelism)continue
      const expire=async()=>{
        if(Date.now()<=taskDeadline(task,taskDeliveryConfig(task,run.config).maxTaskMinutes))return false
        delete task.resumeRequested;task.status='failed';task.error='Task time budget exhausted';task.finishedAt=now();this.phase(task,'blocked',task.error);await this.save(run);return true
      }
      if(await expire())continue
      const provider=this.providerFactory(taskDeliveryConfig(task,run.config))
      const providers=this.resumeProviders.get(run.id)??new Set<TicketProvider>()
      providers.add(provider);this.resumeProviders.set(run.id,providers)
      let held:boolean
      try{held=await this.dependenciesBlocked(run,task,provider)}finally{providers.delete(provider);if(!providers.size)this.resumeProviders.delete(run.id)}
      if(held)continue
      if(this.disposed||run.status!=='running'||task.status!=='blocked'||task.transitionVersion!==version||this.activeCount(run)>=run.config.parallelism)continue
      task.status='starting';delete task.resumeRequested
      const revision=task.transitionVersion=(task.transitionVersion??0)+1
      this.resumingTasks.add(task.id)
      try {
        task.lastWakeAt=now();await this.save(run)
        await this.runtime.prepare(task,taskDeliveryConfig(task,run.config))
        if(this.disposed||isStopped(run))return
        if(run.status!=='running'){task.status='blocked';task.resumeRequested=true;await this.save(run);return}
        if(task.transitionVersion!==revision||task.status!=='starting')continue
        if(await expire())continue
        if(this.disposed||run.status!=='running'||task.transitionVersion!==revision||task.status!=='starting')continue
        await this.runtime.start(task,run)
        if(this.disposed||isStopped(run)){await this.runtime.stop(task.sessionId);return}
        if(task.transitionVersion===revision&&task.status==='starting') {
          task.status='running';delete task.blockedSince;this.phase(task,'analysis')
          await this.save(run)
          if(run.coordinatorWaiting)await this.notify(run,`Ticket #${task.ticket.id} resumed in its existing dedicated session ${task.sessionId}; read the recorded reason and current worker evidence.`,`resumed:${task.id}:${revision}`)
        }
      }catch(error) {
        if(!this.disposed&&!isStopped(run)&&task.transitionVersion===revision&&task.status==='starting') {
          task.status='blocked';task.blockedSince??=now();task.error=`Worker resume failed: ${String(error)}`;this.phase(task,'blocked',task.error);await this.save(run)
        }
      }finally{this.resumingTasks.delete(task.id)}
    }
  }

  async followup(sessionId: string, input: FollowupInput): Promise<string> {
    const { run, task } = this.worker(sessionId)
    if (!input.title.trim() || !input.body.trim() || !(run.config.milestones.includes(input.milestone)||run.config.includeUnmilestoned&&input.milestone==='') || !Array.isArray(input.predecessors) || input.predecessors.some(x => typeof x !== 'string')) throw new Error('Follow-up requires title, scope/acceptance body, configured milestone (or an enabled unassigned milestone) and predecessor IDs')
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
  async announce(run: Run, text: string): Promise<boolean> { return this.notify(run, text) }
  private async notify(run: Run, text: string, deliveryKey?: string,permitted?:()=>boolean): Promise<boolean> {
    if(isStopped(run)||this.disposed||permitted&&!permitted())return false
    try {
      await this.runtime.coordinatorLoop?.(run,'wake')
      if(isStopped(run)||this.disposed||permitted&&!permitted())return false
      return await this.runtime.send(run.captainSessionId, text,deliveryKey,permitted)!==false
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

  /** Independent of an already-running full catalog scan; no new claims. */
  recoverOwned(runIds?:readonly string[]):Promise<void> {
    if(this.disposed)return Promise.resolve()
    for(const run of this.runs.values()) {
      if(!['running','draining'].includes(run.status)||run.recoveryPending||this.startingSessions.has(run.captainSessionId)||runIds&&!runIds.includes(run.id)||this.ownedTicks.has(run.id))continue
      const work=(async()=>{
        const provider=this.providerFactory(run.config)
        this.ownedProviders.set(run.id,provider)
        for(const task of run.tasks)await this.recoverIdleTask(run,task,provider)
        await this.dispatchResumes(run)
      })().catch(async error=>{if(!isStopped(run)&&!this.disposed){run.error=`Owned recovery deferred: ${String(error)}`;await this.save(run)}}).finally(()=>{this.ownedProviders.delete(run.id);this.ownedTicks.delete(run.id)})
      this.ownedTicks.set(run.id,work)
    }
    return Promise.all([...this.ownedTicks.values()]).then(()=>{})
  }
  /** Already-owned idle recovery is local; the full intake catalog can be slow. */
  private recoverIdleTask(run:Run,task:Task,provider:TicketProvider):Promise<void> {
    const existing=this.idleRecoveries.get(task.id)
    if(existing)return existing
    const work=this.recoverIdleTaskRun(run,task,provider).finally(()=>this.idleRecoveries.delete(task.id))
    this.idleRecoveries.set(task.id,work);return work
  }
  private async recoverIdleTaskRun(run:Run,task:Task,provider:TicketProvider):Promise<void> {
    if(this.disposed||!['running','draining'].includes(run.status)||run.recoveryPending||task.status!=='running'||!task.baseSha||this.resumingTasks.has(task.id)||task.parkingError)return
    if(task.prUrl&&task.headSha&&task.reviewHistory?.some(review=>review.passed&&review.headSha===task.headSha))return
    if(task.dependencyBlocked||dependencyBlocker(run.tickets.find(t=>t.id===task.ticket.id)??task.ticket,run.tickets,run.tasks))return
    if(Date.now()>taskDeadline(task,taskDeliveryConfig(task,run.config).maxTaskMinutes))return
    const age=Date.now()-Date.parse(task.lastWakeAt??task.startedAt)
    if(!Number.isFinite(age)||age<=30000||task.phase!=='waiting'&&run.questions.some(q=>q.taskId===task.id&&!q.answer))return
    const version=task.transitionVersion,phase=task.phase
    let executing:boolean
    try{executing=await this.runtime.isRunning(task.sessionId)}catch{return}
    if(this.disposed||!['running','draining'].includes(run.status)||task.transitionVersion!==version||task.status!=='running'||task.phase!==phase||executing)return
    if(phase==='waiting'||phase==='blocked') {
      let blockedAt=now()
      if(phase==='blocked')for(const entry of [...task.phases].reverse()){
        if(entry.phase!=='blocked')break
        if(Number.isFinite(Date.parse(entry.at))&&Date.parse(entry.at)<=Date.parse(blockedAt))blockedAt=entry.at
      }
      task.transitionVersion=(task.transitionVersion??0)+1;task.status='blocked';task.blockedSince=phase==='waiting'?blockedAt:task.blockedSince??blockedAt;task.executionActive=false
      task.error??=phase==='blocked'?(task.phases.at(-1)?.note??'Worker reported a blocked phase'):'Worker and owned members are idle while waiting; diagnose unmet work or prerequisites before resumption'
      this.phase(task,'blocked',task.error);await this.save(run);await this.notifyBlocker(run,task);return
    }
    if(task.idleCheckpointAt){task.status='blocked';task.blockedSince??=now();task.error??='Worker is idle after one recovery checkpoint; diagnose its team and pending work';this.phase(task,'blocked',task.error);await this.save(run);await this.notifyBlocker(run,task);return}
    if(await this.dependenciesBlocked(run,task,provider))return
    try{if(await this.runtime.isRunning(task.sessionId))return}catch{return}
    if(this.disposed||!['running','draining'].includes(run.status)||task.status!=='running'||task.transitionVersion!==version||Date.now()>taskDeadline(task,taskDeliveryConfig(task,run.config).maxTaskMinutes))return
    const previousWake=task.lastWakeAt,checkpoint=now()
    task.idleCheckpointAt=checkpoint;task.recoveryAttempts=(task.recoveryAttempts??0)+1;task.lastWakeAt=now()
    let admitted=false
    try {
      await this.save(run)
      if(this.disposed||!['running','draining'].includes(run.status)||task.status!=='running'||task.transitionVersion!==version)return
      admitted=await this.runtime.start(task,run)!==false
      if(isStopped(run)||this.disposed)await this.runtime.stop(task.sessionId)
    } finally {
      if(!admitted&&task.transitionVersion===version&&task.idleCheckpointAt===checkpoint){delete task.idleCheckpointAt;task.recoveryAttempts=Math.max(0,(task.recoveryAttempts??1)-1);task.lastWakeAt=previousWake;await this.save(run)}
    }

  }
  private async tickRun(run: Run): Promise<void> {
    const provider = this.providerFactory(run.config)
    this.activeProviders.set(run.id, provider)
    await this.notifyPolicy(run)
    for(const task of run.tasks)await this.recoverIdleTask(run,task,provider)
    await this.dispatchResumes(run)
    if(isStopped(run)||this.disposed)return
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
      if(this.resumingTasks.has(task.id))continue
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
      if (Date.now()>taskDeadline(task,taskDeliveryConfig(task,run.config).maxTaskMinutes)) {
        await this.runtime.stop(task.sessionId); task.status = 'failed'; task.error = 'Task time budget exhausted'; task.finishedAt = now(); this.phase(task, 'blocked', task.error); await this.save(run); continue
      }
      if (task.status === 'ready') { await this.integrate(run, task, provider); continue }
      if(task.status==='running'&&(task.dependencyBlocked||dependencyBlocker(run.tickets.find(t=>t.id===task.ticket.id)??task.ticket,run.tickets,run.tasks))) {
        if(await this.dependenciesBlocked(run,task,provider))continue
      }
      if (task.status === 'blocked') {
        const version=task.transitionVersion
        const executing=await this.runtime.isRunning(task.sessionId)
        if(isStopped(run)||this.disposed)return
        if(task.transitionVersion!==version)continue
        if(!task.parkingError)task.executionActive=executing
        if (run.status === 'running' && task.resumeRequested && this.activeCount(run) < run.config.parallelism) {
          delete task.resumeRequested; task.status = 'starting'; await this.save(run)
          await this.launch(run, task, provider); continue
        }
        await this.notifyBlocker(run,task)
        continue
      }
      if (task.status === 'starting') { await this.launch(run, task, provider); continue }
      await this.recoverIdleTask(run,task,provider)
    }
    for (const q of run.questions) {
      if (isStopped(run)) return
      if (q.answer && !q.deliveredAt && !q.recordedAt)try{await this.deliverAnswer(run,q)}catch(error){if(!(error instanceof DiagnosticAnswerDeferred))throw error}
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
    while(true) {
      // Integration or the preceding admission can free capacity or queue owned work.
      await this.dispatchResumes(run)
      if (run.status !== 'running' || this.disposed || this.activeCount(run) >= run.config.parallelism || run.config.maxTickets > 0 && run.tasks.length >= run.config.maxTickets) break
      // Scope/order and task states can change while the previous launch awaits.
      const rows=eligibility(run.tickets,run.config.milestones,run.tasks,run.config)
      const eligible = new Set(rows.filter(r=>r.eligible).map(r=>r.ticketId)),ranks=new Map(rows.map(row=>[row.ticketId,row.milestoneRank])),priorities=new Map(rows.map(row=>[row.ticketId,row.priority]))
      const ticket = run.tickets.filter(t=>eligible.has(t.id)).sort((a,b)=>(ranks.get(a.id)??run.config.milestones.length)-(ranks.get(b.id)??run.config.milestones.length)||(priorities.get(a.id)??a.priority)-(priorities.get(b.id)??b.priority)||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id))[0]
      if(!ticket)break
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
      if(await this.dependenciesBlocked(run,task,provider))return
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
      if(await this.dependenciesBlocked(run,task,provider))return
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
      if(await this.dependenciesBlocked(run,task,provider))return
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
        if(await this.dependenciesBlocked(run,task,provider))return
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
  private async heldDependencyWake(run:Run,task:Task):Promise<boolean> {
    if(task.parkingError||this.dependencyQuiescences.has(task.id))return true
    const current=run.tickets.find(t=>t.id===task.ticket.id)??task.ticket
    if(!task.dependencyBlocked&&!dependencyBlocker(current,run.tickets,run.tasks))return false
    return this.dependenciesBlocked(run,task,this.providerFactory(taskDeliveryConfig(task,run.config)))
  }
  private async dependenciesBlocked(run:Run,task:Task,provider:TicketProvider):Promise<boolean> {
    if(task.parkingError||this.dependencyQuiescences.has(task.id))return true
    const revision=task.transitionVersion
    let reason:string|undefined
    try {reason=provider.verifyDependencies?await provider.verifyDependencies(task):dependencyBlocker(run.tickets.find(t=>t.id===task.ticket.id)??task.ticket,run.tickets,run.tasks)}
    catch(error){reason=`Cannot verify current dependencies: ${String(error)}`}
    if(isStopped(run)||this.disposed||task.transitionVersion!==revision||this.dependencyQuiescences.has(task.id))return true
    if(!reason){if(task.dependencyBlocked){delete task.dependencyBlocked;if(task.error?.startsWith('Dependency gate:')){task.phases.push({phase:task.phase,at:now(),note:`Historical ${task.error}; fresh dependency verification now permits work.`});delete task.error}};return false}
    task.transitionVersion=(task.transitionVersion??0)+1
    task.status='blocked';task.dependencyBlocked=true;task.blockedSince??=now();task.error=`Dependency gate: ${reason}`;task.executionActive=true;delete task.resumeRequested
    // Durable reservation precedes every await. Cleanup ownership is independent
    // of report/guidance revisions and must settle before Stop can release leases.
    task.parkingError='Dependency pause pending writer quiescence'
    this.phase(task,'blocked',task.error)
    const pending=(async()=>{
      try {await this.save(run);await this.runtime.stop(task.sessionId,'shutdown');task.executionActive=false;delete task.parkingError}
      catch(error){task.parkingError=String(error);task.executionActive=true;task.error=`Dependency gate: ${reason}; worker quiescence failed: ${String(error)}`}
      await this.save(run)
    })()
    this.dependencyQuiescences.set(task.id,pending)
    try{await pending}finally{this.dependencyQuiescences.delete(task.id)}
    if(!isStopped(run)&&!this.disposed)await this.notifyBlocker(run,task)
    return true
  }

  private async repair(run: Run, task: Task, reason: string): Promise<void> {
    if(task.dependencyBlocked||task.parkingError||this.dependencyQuiescences.has(task.id)){await this.save(run);return}
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
    for (const provider of this.ownedProviders.values()) provider.cancel?.()
    for(const providers of this.resumeProviders.values())for(const provider of providers)provider.cancel?.()
    for (const run of this.runs.values()) await this.drainWorkers(run, false,'shutdown')
    await this.ticking
    await Promise.all([...this.resumeDispatches.values()])
    await Promise.all([...this.ownedTicks.values()])
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
        await this.dependencyQuiescences.get(task.id)
        await this.runtime.stop(task.sessionId,reason)
        task.executionActive=false;delete task.parkingError
        if (cancel && task.status!=='parked') { task.status = 'cancelled'; this.phase(task, 'blocked', 'Stopped by user'); task.finishedAt = now() }
      } catch (error) { const message = `${task.ticket.id}: ${String(error)}`; task.error = `Shutdown incomplete: ${message}`; errors.push(message) }
    }))
    if (errors.length) run.error = `Shutdown incomplete; repository ownership retained: ${errors.join('; ')}`
    else if (run.error?.startsWith('Shutdown incomplete')) delete run.error
    await this.save(run)
    return errors
  }
}
