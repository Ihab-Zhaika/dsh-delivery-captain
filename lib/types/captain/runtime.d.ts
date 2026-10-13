import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { CommandRunner, Run, RunConfig, Task, WorkerRuntime } from './types.ts';
/** Real per-session policy writes, inherited by original AgentTeams descendants. */
export declare function configureFullAccess(ctx: Context, sessionId: string): Promise<void>;
export declare function workerPrompt(task: Task, config: RunConfig): string;
export declare function reviewInstructions(config: RunConfig): string;
export declare function recoveryPrompt(task: Task, run: Run): string;
export declare function incorporationInstructions(config: RunConfig): string;
export declare function workerResumePrompt(task: Task, config?: RunConfig | undefined): string;
interface DeliveryOwner {
    run: Run;
    task: Task;
    agent: Agent;
    stamp: string;
}
/** Resolve only an exact registered root or its direct original continuable member. Never adopt by cwd/ancestor. */
export declare function deliveryOwner(ctx: Context, runs: readonly Run[], agent: Agent, stateDir?: string): Promise<DeliveryOwner | undefined>;
/** Host-owned dynamic instruction integration. No prompts, model selection, state edits or worker wakes. */
export declare function installDeliveryPolicy(ctx: Context, runs: () => readonly Run[]): void;
export interface RuntimeOptions {
    runner?: CommandRunner;
    teamStateDir?: string;
}
export declare function createRuntime(ctx: Context, options?: RuntimeOptions): WorkerRuntime;
export {};
