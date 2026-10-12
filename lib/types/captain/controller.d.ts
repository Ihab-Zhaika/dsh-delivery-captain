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
    private ticking?;
    private disposed;
    constructor(store: RunStore, runtime: WorkerRuntime, providerFactory: (config: RunConfig) => TicketProvider);
    /** Rehydrate only explicitly started runs. Startup does not opt ordinary sessions in. */
    restore(): Promise<void>;
    state(sessionId: string): Run | null;
    all(): Run[];
    private save;
    private captain;
    private worker;
    private phase;
    start(sessionId: string, raw: unknown): Promise<Run>;
    control(sessionId: string, action: string, parallelism?: number): Promise<Run>;
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
    followup(sessionId: string, input: FollowupInput): Promise<string>;
    private activeCount;
    private notifyBlocker;
    announce(run: Run, text: string): Promise<void>;
    private notify;
    private notifyQuestion;
    /** Deduplicated timer entry. No model polling is required for queue discovery. */
    tick(): Promise<void>;
    private tickAll;
    private tickRun;
    private launch;
    private integrate;
    private repair;
    dispose(): Promise<void>;
    private drainWorkers;
}
