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
        role: "worker";
        coordinatorSessionId: string;
        run: {
            tasks: Task[];
            tickets: import("./types.ts").Ticket[];
            questions: Question[];
            version: 1;
            id: string;
            captainSessionId: string;
            config: RunConfig;
            status: "running" | "paused" | "draining" | "stopped";
            createdAt: string;
            updatedAt: string;
            error?: string;
            lastPollAt?: string;
            recoveryPending?: boolean;
            stoppedAt?: string;
            coordinatorGoalId?: string;
            coordinatorWaiting?: boolean;
            coordinatorLoopError?: string;
            coordinatorRevision?: number;
        };
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
        role: "worker";
        coordinatorSessionId: string;
        run: {
            tasks: Task[];
            tickets: import("./types.ts").Ticket[];
            questions: Question[];
            version: 1;
            id: string;
            captainSessionId: string;
            config: RunConfig;
            status: "running" | "paused" | "draining" | "stopped";
            createdAt: string;
            updatedAt: string;
            error?: string;
            lastPollAt?: string;
            recoveryPending?: boolean;
            stoppedAt?: string;
            coordinatorGoalId?: string;
            coordinatorWaiting?: boolean;
            coordinatorLoopError?: string;
            coordinatorRevision?: number;
        };
    }>;
    all(): Run[];
    private save;
    private endLoop;
    private captain;
    private worker;
    private phase;
    start(sessionId: string, raw: unknown): Promise<Run>;
    control(sessionId: string, action: string, parallelism?: number): Promise<Run>;
    configure(sessionId: string, raw: unknown): Promise<Run>;
    wait(sessionId: string): Promise<void>;
    loopState(sessionId: string): import("./types.ts").CoordinatorLoopState | null;
    report(sessionId: string, report: {
        phase: Phase;
        ready?: boolean;
        blocked?: boolean;
        note?: string;
    }): Promise<Task>;
    question(sessionId: string, question: string): Promise<Question>;
    answer(sessionId: string, questionId: string, answer: string, action?: 'resume' | 'wait'): Promise<Question>;
    private deliverAnswer;
    message(sessionId: string, taskId: string, text: string, action?: 'resume' | 'wait'): Promise<void>;
    resumeTask(sessionId: string, taskId: string, evidence: string, human?: boolean): Promise<Task>;
    followup(sessionId: string, input: FollowupInput): Promise<string>;
    private activeCount;
    private notifyBlocker;
    announce(run: Run, text: string): Promise<void>;
    private notify;
    private notifyQuestion;
    /** Deduplicated timer entry. No model polling is required for queue discovery. */
    tick(runIds?: readonly string[]): Promise<void>;
    private tickRun;
    private launch;
    private integrate;
    private repair;
    dispose(): Promise<void>;
    private drainWorkers;
}
