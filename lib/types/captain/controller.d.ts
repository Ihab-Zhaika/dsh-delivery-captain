import type { FollowupInput, Phase, Question, Run, RunConfig, Task, TicketProvider, WorkerRuntime } from './types.ts';
import { RunStore } from './store.ts';
export declare const repositoryKey: (c: RunConfig) => string;
/** Durable orchestration; timers call tick, models only report and answer questions. */
export declare class CaptainController {
    private readonly store;
    private readonly runtime;
    private readonly providerFactory;
    private readonly runs;
    private readonly starting;
    private readonly startingSessions;
    private readonly activeProviders;
    private readonly stoppingRuns;
    private ticking?;
    private readonly runTicks;
    private readonly ownedTicks;
    private readonly ownedProviders;
    private readonly idleRecoveries;
    private readonly recoveryScans;
    private readonly recoveryGrades;
    private readonly recoveryGradeProviders;
    private readonly resumeDispatches;
    private readonly resumeProviders;
    private readonly resumingTasks;
    private readonly dependencyQuiescences;
    private disposed;
    constructor(store: RunStore, runtime: WorkerRuntime, providerFactory: (config: RunConfig) => TicketProvider);
    /** Rehydrate only explicitly started runs. Startup does not opt ordinary sessions in. */
    restore(): Promise<void>;
    state(sessionId: string): Run | null;
    /** Session projection is separate from internal ownership lookup. */
    view(sessionId: string): {
        role: "idle";
        run: null;
        coordinatorSessionId: null;
    } | {
        role: "coordinator";
        run: Run;
        coordinatorSessionId: string;
    } | {
        run: {
            tasks: Task[];
            tickets: import("./types.ts").Ticket[];
            questions: Question[];
            recoveryCampaign: {
                task: Task;
                fingerprint: string;
                affectedTaskIds: string[];
                affectedHoldRevisions?: Record<string, number>;
                generation?: number;
                lastAttemptAt?: string;
                lastSentFingerprint?: string;
                error?: string;
                settlement?: {
                    kind: "resolved" | "external";
                    at: string;
                    note: string;
                    fingerprint: string;
                };
            } | undefined;
            recoveryReleases: {
                taskId: string;
                sourceHead?: string;
                targetSha?: string;
                note: string;
                key: string;
                holdRevision?: number;
                queuedAt?: string;
                revokedAt?: string;
                error?: string;
            }[] | undefined;
            version: 1;
            id: string;
            captainSessionId: string;
            config: RunConfig;
            status: "running" | "paused" | "draining" | "stopped";
            intakeMode?: "existing-only" | "new-tickets";
            backlogHold?: {
                since: string;
                parked: number;
                threshold: number;
                reason: string;
            };
            schedulerFailures?: {
                count: number;
                at: string;
                message: string;
            };
            createdAt: string;
            updatedAt: string;
            error?: string;
            lastPollAt?: string;
            recoveryPending?: boolean;
            policyNotice?: {
                revision: number;
                text: string;
                deliveredAt?: string;
            };
            stoppedAt?: string;
            coordinatorGoalId?: string;
            coordinatorWaiting?: boolean;
            coordinatorLoopError?: string;
            coordinatorRevision?: number;
        };
        recoveryScope?: Task[] | undefined;
        role: "worker";
        coordinatorSessionId: string;
    };
    sessionView(sessionId: string): Promise<{
        role: "idle";
        run: null;
        coordinatorSessionId: null;
    } | {
        role: "coordinator";
        run: Run;
        coordinatorSessionId: string;
    } | {
        run: Run;
        role: "worker";
        coordinatorSessionId: string;
    } | {
        run: {
            tasks: Task[];
            tickets: import("./types.ts").Ticket[];
            questions: Question[];
            recoveryCampaign: {
                task: Task;
                fingerprint: string;
                affectedTaskIds: string[];
                affectedHoldRevisions?: Record<string, number>;
                generation?: number;
                lastAttemptAt?: string;
                lastSentFingerprint?: string;
                error?: string;
                settlement?: {
                    kind: "resolved" | "external";
                    at: string;
                    note: string;
                    fingerprint: string;
                };
            } | undefined;
            recoveryReleases: {
                taskId: string;
                sourceHead?: string;
                targetSha?: string;
                note: string;
                key: string;
                holdRevision?: number;
                queuedAt?: string;
                revokedAt?: string;
                error?: string;
            }[] | undefined;
            version: 1;
            id: string;
            captainSessionId: string;
            config: RunConfig;
            status: "running" | "paused" | "draining" | "stopped";
            intakeMode?: "existing-only" | "new-tickets";
            backlogHold?: {
                since: string;
                parked: number;
                threshold: number;
                reason: string;
            };
            schedulerFailures?: {
                count: number;
                at: string;
                message: string;
            };
            createdAt: string;
            updatedAt: string;
            error?: string;
            lastPollAt?: string;
            recoveryPending?: boolean;
            policyNotice?: {
                revision: number;
                text: string;
                deliveredAt?: string;
            };
            stoppedAt?: string;
            coordinatorGoalId?: string;
            coordinatorWaiting?: boolean;
            coordinatorLoopError?: string;
            coordinatorRevision?: number;
        } | {
            tasks: never[];
            tickets: never[];
            questions: never[];
            version: 1;
            id: string;
            captainSessionId: string;
            config: RunConfig;
            status: "running" | "paused" | "draining" | "stopped";
            intakeMode?: "existing-only" | "new-tickets";
            backlogHold?: {
                since: string;
                parked: number;
                threshold: number;
                reason: string;
            };
            recoveryCampaign?: {
                task: Task;
                fingerprint: string;
                affectedTaskIds: string[];
                affectedHoldRevisions?: Record<string, number>;
                generation?: number;
                lastAttemptAt?: string;
                lastSentFingerprint?: string;
                error?: string;
                settlement?: {
                    kind: "resolved" | "external";
                    at: string;
                    note: string;
                    fingerprint: string;
                };
            };
            recoveryReleases?: Array<{
                taskId: string;
                sourceHead?: string;
                targetSha?: string;
                note: string;
                key: string;
                holdRevision?: number;
                queuedAt?: string;
                revokedAt?: string;
                error?: string;
            }>;
            schedulerFailures?: {
                count: number;
                at: string;
                message: string;
            };
            createdAt: string;
            updatedAt: string;
            error?: string;
            lastPollAt?: string;
            recoveryPending?: boolean;
            policyNotice?: {
                revision: number;
                text: string;
                deliveredAt?: string;
            };
            stoppedAt?: string;
            coordinatorGoalId?: string;
            coordinatorWaiting?: boolean;
            coordinatorLoopError?: string;
            coordinatorRevision?: number;
        };
        role: "worker";
        recoveryScope?: Task[] | undefined;
        coordinatorSessionId: string;
    }>;
    all(): Run[];
    private save;
    private endLoop;
    private captain;
    private ownedTasks;
    private findTask;
    private diagnostics;
    private worker;
    private phase;
    start(sessionId: string, raw: unknown): Promise<Run>;
    control(sessionId: string, action: string, parallelism?: number): Promise<Run>;
    configure(sessionId: string, raw: unknown): Promise<Run>;
    wait(sessionId: string): Promise<void>;
    updateMilestones(sessionId: string, milestones: unknown, expectedRevision?: number): Promise<Run>;
    updatePolicy(sessionId: string, raw: unknown, expectedRevision?: number): Promise<Run>;
    private updateReviewBudget;
    private recordPolicyNotice;
    private notifyPolicy;
    loopState(sessionId: string): import("./types.ts").CoordinatorLoopState | null;
    report(sessionId: string, report: {
        phase: Phase;
        ready?: boolean;
        blocked?: boolean;
        note?: string;
        affectedTaskIds?: string[];
    }): Promise<Task>;
    question(sessionId: string, question: string): Promise<Question>;
    answer(sessionId: string, questionId: string, answer: string, action?: 'resume' | 'wait'): Promise<Question>;
    private deliverAnswer;
    message(sessionId: string, taskId: string, text: string, action?: 'resume' | 'wait'): Promise<void>;
    resumeTask(sessionId: string, taskId: string, evidence: string, human?: boolean, teamMemberLimit?: number): Promise<Task>;
    private resumeTaskInternal;
    /** Existing assignment transport never waits for the intake/discovery lane. */
    private dispatchResumes;
    private dispatchResumeRun;
    followup(sessionId: string, input: FollowupInput): Promise<string>;
    private activeCount;
    private notifyBlocker;
    announce(run: Run, text: string): Promise<boolean>;
    private notify;
    private notifyQuestion;
    /** Deduplicated timer entry. No model polling is required for queue discovery. */
    tick(runIds?: readonly string[]): Promise<void>;
    /** Independent of an already-running full catalog scan; no new claims. */
    recoverOwned(runIds?: readonly string[]): Promise<void>;
    /** One durable non-ticket recovery owner, independent of catalog discovery. */
    private coordinateRecovery;
    private coordinateRecoveryRun;
    private gradeRecovery;
    private releaseSharedRecovery;
    private dispatchRecoveryReleases;
    settleRecovery(sessionId: string, kind: 'resolved' | 'external', note: string, affectedTaskIds: string[]): Promise<Run>;
    /** Already-owned idle recovery is local; the full intake catalog can be slow. */
    private recoverIdleTask;
    private recoverIdleTaskRun;
    private tickRun;
    private launch;
    private integrate;
    private heldDependencyWake;
    private dependenciesBlocked;
    private repair;
    dispose(): Promise<void>;
    private drainWorkers;
}
