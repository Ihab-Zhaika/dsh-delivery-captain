import type { Context } from '@deepseek-ai/cordis';
import type { CommandRunner, RunConfig, Task, WorkerRuntime } from './types.ts';
/** Real per-session policy writes, inherited by original AgentTeams descendants. */
export declare function configureFullAccess(ctx: Context, sessionId: string): Promise<void>;
export declare function workerPrompt(task: Task, config: RunConfig): string;
export interface RuntimeOptions {
    runner?: CommandRunner;
    teamStateDir?: string;
}
export declare function createRuntime(ctx: Context, options?: RuntimeOptions): WorkerRuntime;
