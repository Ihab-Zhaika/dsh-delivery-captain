/** Browser-safe delivery contracts. External data must be validated at adapters. */
export type Phase = 'setup' | 'analysis' | 'implementation' | 'testing' | 'review' | 'repair' | 'integration' | 'waiting' | 'blocked' | 'parked' | 'complete';
export interface Ticket {
    id: string;
    title: string;
    body: string;
    url: string;
    milestone: string;
    predecessors: string[];
    state: 'open' | 'closed';
    merged: boolean;
    priority: number;
    createdAt: string;
    labels: string[];
    exclusion?: string;
    completedDecision?: boolean;
}
export interface RunConfig {
    provider: 'github' | 'azure';
    repository: string;
    workspace: string;
    organization?: string;
    project?: string;
    query?: string;
    milestones: string[];
    remote: string;
    targetBranch: string;
    parallelism: number;
    maxTeamMembers: number;
    pollSeconds: number;
    maxTickets: number;
    maxRepairRounds: number;
    maxTaskMinutes: number;
    verifyCommands: string[];
    workerPreset: string;
    requireBrowser: boolean;
    requireMemory: boolean;
    ticketIds?: string[];
    verifyCommandsByTicket?: Record<string, string[]>;
}
export interface RepositoryContext {
    config: RunConfig;
    providers: RunConfig['provider'][];
    warnings: string[];
    milestoneSource: string;
    verificationSource: string;
    milestoneCatalog: string[];
}
export interface PhaseEvent {
    phase: Phase;
    at: string;
    note?: string;
}
export interface Question {
    id: string;
    taskId: string;
    question: string;
    createdAt: string;
    answer?: string;
    action?: 'resume' | 'wait';
    answeredAt?: string;
    deliveredAt?: string;
    recordedAt?: string;
    notifiedAt?: string;
    lastNotifyAttemptAt?: string;
}
export interface Task {
    id: string;
    ticket: Ticket;
    attempt: string;
    sessionId: string;
    branch: string;
    worktree: string;
    baseSha: string;
    headSha?: string;
    workspaceId?: string;
    workspaceError?: string;
    status: 'starting' | 'running' | 'blocked' | 'parked' | 'ready' | 'merged' | 'failed' | 'cancelled';
    phase: Phase;
    phases: PhaseEvent[];
    startedAt: string;
    finishedAt?: string;
    reviewRounds: number;
    error?: string;
    prUrl?: string;
    mergedSha?: string;
    lastWakeAt?: string;
    followups: string[];
    recoveryAttempts?: number;
    resumeRequested?: boolean;
    closedAt?: string;
    assignmentDelivered?: boolean;
    executionActive?: boolean;
    idleCheckpointAt?: string;
    transitionVersion?: number;
    waitingDecision?: string;
    blockedSince?: string;
    parkedAt?: string;
    parkReason?: string;
    parkingError?: string;
    blockerFingerprint?: string;
    blockerNotifiedAt?: string;
    lastBlockerNotifyAttemptAt?: string;
    lastGuidanceHash?: string;
    reviewHistory?: Array<ReviewResult & {
        at: string;
    }>;
}
export interface Run {
    version: 1;
    id: string;
    captainSessionId: string;
    config: RunConfig;
    status: 'running' | 'paused' | 'draining' | 'stopped';
    createdAt: string;
    updatedAt: string;
    tasks: Task[];
    tickets: Ticket[];
    questions: Question[];
    error?: string;
    lastPollAt?: string;
    recoveryPending?: boolean;
    coordinatorGoalId?: string;
    coordinatorWaiting?: boolean;
    coordinatorLoopError?: string;
    coordinatorRevision?: number;
}
export type CoordinatorLoopAction = 'start' | 'resume' | 'pause' | 'stop' | 'shutdown' | 'wait' | 'wake';
export interface CoordinatorLoopState {
    status: 'not-started' | 'active' | 'waiting' | 'paused' | 'blocked' | 'complete' | 'unavailable';
    id?: string;
    phase?: 'active' | 'paused' | 'blocked' | 'complete';
    activation?: 'armed' | 'disarmed';
    roundsStarted?: number;
    maxGoalRounds?: number;
    reason?: string;
}
export interface PullRequest {
    id: string;
    url: string;
    headSha: string;
    merged: boolean;
    mergeSha?: string;
    checksPassed: boolean;
    blockedReason?: string;
}
export interface FollowupInput {
    title: string;
    body: string;
    milestone: string;
    predecessors: string[];
}
export interface TicketProvider {
    cancel?(): void;
    preflight(): Promise<void>;
    discover(): Promise<Ticket[]>;
    claim(ticket: Ticket, runId: string): Promise<void>;
    ensurePullRequest(task: Task): Promise<PullRequest>;
    inspectPullRequest(task: Task): Promise<PullRequest>;
    merge(task: Task, expectedHead: string): Promise<PullRequest>;
    close(task: Task): Promise<void>;
    createFollowup(task: Task, input: FollowupInput): Promise<string>;
}
export interface ReviewResult {
    passed: boolean;
    headSha: string;
    baseSha?: string;
    report: string;
    findings: string[];
    failureKind?: 'team-evidence' | 'infrastructure' | 'findings';
}
export interface WorkerRuntime {
    coordinatorLoop?(run: Run, action: CoordinatorLoopAction): Promise<void>;
    coordinatorLoopState?(run: Run): CoordinatorLoopState;
    parentSession?(sessionId: string): Promise<string | null>;
    workspacePath?(sessionId: string): Promise<string | null>;
    evidence?(run: Run): Promise<unknown>;
    assertCaptainDiagnostics?(run: Run): Promise<void>;
    registerWorkspace?(task: Task, run: Run): Promise<void>;
    restore?(task: Task, run: Run): Promise<void>;
    preflight(config: RunConfig): Promise<void>;
    prepare(task: Task, config: RunConfig): Promise<void>;
    start(task: Task, run: Run): Promise<void>;
    send(sessionId: string, text: string, deliveryKey?: string): Promise<void>;
    stop(sessionId: string, reason?: 'stop' | 'shutdown'): Promise<void>;
    isRunning(sessionId: string): Promise<boolean>;
    review(task: Task, config: RunConfig, onPhase?: (phase: Phase) => Promise<void>): Promise<ReviewResult>;
    isReviewCurrent?(task: Task, config: RunConfig, review: ReviewResult): Promise<boolean>;
    head(task: Task): Promise<string>;
}
export type CommandRunner = (file: string, args: readonly string[], options?: {
    cwd?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
}) => Promise<string>;
