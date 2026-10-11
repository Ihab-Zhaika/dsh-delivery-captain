/** Browser-safe delivery contracts. External data must be validated at adapters. */
export type Phase = 'setup' | 'analysis' | 'implementation' | 'testing' | 'review' | 'repair' | 'integration' | 'waiting' | 'blocked' | 'complete';
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
    maxRepairRounds: number;
    maxTaskMinutes: number;
    verifyCommands: string[];
    workerPreset: string;
    requireBrowser: boolean;
    requireMemory: boolean;
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
    answeredAt?: string;
    deliveredAt?: string;
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
    status: 'starting' | 'running' | 'blocked' | 'ready' | 'merged' | 'failed' | 'cancelled';
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
    closedAt?: string;
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
}
export interface WorkerRuntime {
    restore?(task: Task, run: Run): Promise<void>;
    preflight(config: RunConfig): Promise<void>;
    prepare(task: Task, config: RunConfig): Promise<void>;
    start(task: Task, run: Run): Promise<void>;
    send(sessionId: string, text: string): Promise<void>;
    stop(sessionId: string): Promise<void>;
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
