/** Browser-safe delivery contracts. External data must be validated at adapters. */
export type Phase = 'setup' | 'analysis' | 'implementation' | 'testing' | 'review' | 'repair' | 'integration' | 'waiting' | 'blocked' | 'parked' | 'complete'
export interface Ticket {
  id: string; title: string; body: string; url: string; milestone: string;
  predecessors: string[]; state: 'open' | 'closed'; merged: boolean;
  priority: number; createdAt: string; labels: string[]; exclusion?: string; selectionExclusion?:string; completedDecision?: boolean;
}
export interface RunConfig {
  provider: 'github' | 'azure'; repository: string; workspace: string;
  organization?: string; project?: string; query?: string;
  milestones: string[]; remote: string; targetBranch: string;
  includeUnmilestoned?:boolean; includeRequiredPredecessors?:boolean; ocrMaxTokensBudget?:number;
  parkedRecoveryThreshold?:number;
  reviewBackend?:'agent'|'ocr';ocrAdditionalCheck?:boolean;
  parallelism: number; maxTeamMembers: number; pollSeconds: number; maxTickets: number;
  maxRepairRounds: number; maxTaskMinutes: number;
  verifyCommands: string[]; workerPreset: string;
  requireBrowser: boolean; requireMemory: boolean;
  ticketIds?: string[];
  verifyCommandsByTicket?: Record<string,string[]>;
}
export interface RepositoryContext {
  config: RunConfig;
  providers: RunConfig['provider'][];
  warnings: string[];
  milestoneSource: string;
  verificationSource: string;
  milestoneCatalog: string[];
}
export interface PhaseEvent { phase: Phase; at: string; note?: string }
export interface Question {
  id: string; taskId: string; question: string; createdAt: string;
  answer?: string; action?: 'resume' | 'wait'; answeredAt?: string; answerVersion?: number;
  deliveredAt?: string; recordedAt?: string; deliveryError?: string;
  notifiedAt?: string; lastNotifyAttemptAt?: string;
  supersededAt?: string; supersededReason?: string;
  /** Retained older pending answers; a fresh answer clears only the current marker. */
  supersededAnswers?: Array<{answerVersion:number;answer:string;action?:'resume'|'wait';answeredAt?:string;at:string;reason:string}>;
}
export interface Task {
  kind?:'recovery';
  maintenanceHandoff?:RecoveryMaintenance;
  incorporateTargetSha?:string;
  recoveryScopeAt?:string;
  holdRevision?:number;
  assignmentConfig?:RunConfig;
  budgetStartedAt?:string;
  pendingHumanRetry?:{at:string;reason:string;previousBlocker?:string};
  id: string; ticket: Ticket; attempt: string; sessionId: string;
  branch: string; worktree: string; baseSha: string; headSha?: string; workspaceId?: string; workspaceError?: string;
  status: 'starting' | 'running' | 'blocked' | 'parked' | 'ready' | 'merged' | 'failed' | 'cancelled';
  phase: Phase; phases: PhaseEvent[]; startedAt: string; finishedAt?: string;
  reviewRounds: number; error?: string; prUrl?: string; mergedSha?: string;
  lastWakeAt?: string; followups: string[];
  recoveryAttempts?: number; resumeRequested?: boolean; closedAt?: string;
  assignmentDelivered?: boolean; executionActive?: boolean; idleCheckpointAt?: string;
  transitionVersion?: number;
  waitingDecision?: string;
  blockedSince?: string; parkedAt?: string; parkReason?: string; parkingError?: string;
  dependencyBlocked?:boolean;
  blockerFingerprint?: string; blockerNotifiedAt?: string; lastBlockerNotifyAttemptAt?: string; lastGuidanceHash?: string;
  /** Exact existing native inbox batch that was re-armed once after an idle root. */
  pendingInputWake?: { fingerprint: string; at: string };
  reviewHistory?: Array<ReviewResult & { at: string }>;
}
export interface Run {
  version: 1; id: string; captainSessionId: string; config: RunConfig;
  status: 'running' | 'paused' | 'draining' | 'stopped';
  intakeMode?: 'existing-only' | 'new-tickets';
  backlogHold?:{since:string;parked:number;threshold:number;reason:string};
  recoveryCampaign?:{task:Task;fingerprint:string;affectedTaskIds:string[];affectedHoldRevisions?:Record<string,number>;generation?:number;lastAttemptAt?:string;lastSentFingerprint?:string;error?:string;admissionFailure?:{fingerprint:string;coordinatorRevision:number;at:string;reason:string};settlement?:{kind:'resolved'|'external';at:string;note:string;fingerprint:string}};
  recoveryReleases?:Array<{taskId:string;sourceHead?:string;targetSha?:string;note:string;key:string;holdRevision?:number;queuedAt?:string;revokedAt?:string;error?:string}>;
  schedulerFailures?:{count:number;at:string;message:string};
  maintenanceReviewHistory?:MaintenanceReviewRecord[];
  createdAt: string; updatedAt: string; tasks: Task[]; tickets: Ticket[];
  questions: Question[]; error?: string; lastPollAt?: string;
  recoveryPending?: boolean;
  policyNotice?:{revision:number;text:string;deliveredAt?:string};
  stoppedAt?:string;
  coordinatorGoalId?:string; coordinatorWaiting?:boolean; coordinatorLoopError?:string; coordinatorRevision?:number;
}
export type CoordinatorLoopAction='start'|'resume'|'pause'|'stop'|'shutdown'|'wait'|'wake';
export interface CoordinatorLoopState {status:'not-started'|'active'|'waiting'|'paused'|'blocked'|'complete'|'unavailable';id?:string;phase?:'active'|'paused'|'blocked'|'complete';activation?:'armed'|'disarmed';roundsStarted?:number;maxGoalRounds?:number;reason?:string}
export interface PullRequest { id: string; url: string; headSha: string; merged: boolean; mergeSha?: string; checksPassed: boolean; blockedReason?: string }
export interface FollowupInput { title: string; body: string; milestone: string; predecessors: string[] }
export interface TicketProvider {
  cancel?(): void;
  preflight(): Promise<void>;
  discover(): Promise<Ticket[]>;
  claim(ticket: Ticket, runId: string): Promise<void>;
  verifyDependencies?(task:Task):Promise<string|undefined>;
  ensurePullRequest(task: Task): Promise<PullRequest>;
  inspectPullRequest(task: Task): Promise<PullRequest>;
  merge(task: Task, expectedHead: string,permitted?:()=>boolean): Promise<PullRequest>;
  close(task: Task): Promise<void>;
  createFollowup(task: Task, input: FollowupInput, permitted?: () => boolean): Promise<string>;
}
export interface ReviewResult { passed: boolean; headSha: string; baseSha?: string; report: string; findings: string[];backend?:'agent'|'ocr';policyStamp?:string;reviewerSessionId?:string;failureKind?: 'team-evidence' | 'infrastructure' | 'findings' }
export interface MaintenanceReviewRecord {id:string;baseSha:string;headSha:string;budget:number;policy:string;startedAt:string;finishedAt?:string;result?:ReviewResult&{treeSha?:string;directory?:string}}
export interface RecoveryMaintenance {worktree:string;repository:string;branch:string;baseSha:string;headSha:string;treeSha:string;incorporated:boolean;loaded:boolean}
export type QueuedInputWake = {kind:'woke'|'queued'|'already-attempted'|'busy'|'empty'|'changed'|'failed'|'unknown';fingerprint?:string};
export interface WorkerRuntime {
  coordinatorLoop?(run:Run,action:CoordinatorLoopAction):Promise<void>;
  coordinatorLoopState?(run:Run):CoordinatorLoopState;
  parentSession?(sessionId:string):Promise<string|null>;
  workspacePath?(sessionId:string):Promise<string|null>;
  evidence?(run: Run): Promise<unknown>;
  assertCaptainDiagnostics?(run: Run, task?: Task): Promise<void>;
  assertRecoveryDiagnostics?(run:Run):Promise<void>;
  containsTarget?(task:Task,sha:string):Promise<boolean>;
  renewRecovery?(task:Task,config:RunConfig,generation:number):Promise<void>;
  recoveryHasChanges?(task:Task):Promise<boolean>;
  recoveryMaintenance?(task:Task):Promise<RecoveryMaintenance|undefined>;
  reviewMaintenance?(run:Run,baseSha:string,headSha:string,signal?:AbortSignal):Promise<ReviewResult&{treeSha?:string;directory?:string}>;
  cancelMaintenanceReview?(runId:string):void;
  registerWorkspace?(task: Task, run: Run): Promise<void>;
  restore?(task: Task, run: Run): Promise<void>;
  preflight(config: RunConfig): Promise<void>;
  prepare(task: Task, config: RunConfig): Promise<void>;
  start(task: Task, run: Run): Promise<void|boolean>;
  send(sessionId: string, text: string, deliveryKey?: string,permitted?:()=>boolean): Promise<void|boolean>;
  stop(sessionId: string,reason?: 'stop'|'shutdown'): Promise<void>;
  /** Re-arm one exact existing idle-root inbox item without inserting new prompt content. */
  wakeQueuedInput?(sessionId:string,previousFingerprint?:string,allowWake?:boolean):Promise<QueuedInputWake>;
  /**
   * Exact owned activity check. `ignoreWaitingCaptain` is reserved for the
   * controller's long-idle `phase === 'waiting'` capacity check: it excludes
   * only the ticket captain's wait turn after the exact Original team is
   * proven to have no active or dependency-ready work. Inbox, member, job,
   * review and unreadable-evidence checks remain fail-closed.
   */
  isRunning(sessionId: string, options?: {ignoreWaitingCaptain?:boolean;ignoreQueuedInputFingerprint?:string}): Promise<boolean>;
  review(task: Task, config: RunConfig, onPhase?: (phase: Phase) => Promise<void>): Promise<ReviewResult>;
  isReviewCurrent?(task: Task, config: RunConfig, review: ReviewResult): Promise<boolean>;
  head(task: Task): Promise<string>;
}
export type CommandRunner = (file: string, args: readonly string[], options?: { cwd?: string; timeoutMs?: number; signal?: AbortSignal }) => Promise<string>;
