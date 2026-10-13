import type { AgentReviewInput } from './agent-review.ts';
import type { CommandRunner, ReviewResult } from './types.ts';
type Adapter = (input: AgentReviewInput, signal: AbortSignal) => Promise<{
    report: string;
    findings: string[];
    reviewerSessionId: string;
}>;
/** Explicit maintenance range only; no consumer task/provider, CI execution or publication. */
export declare function reviewMaintenanceRange(ownerRoot: string, baseSha: string, expectedHead: string, budget: number, run: CommandRunner, adapter: Adapter, signal: AbortSignal): Promise<ReviewResult & {
    treeSha?: string;
    directory?: string;
}>;
export {};
