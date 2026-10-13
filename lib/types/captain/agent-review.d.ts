import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
export interface AgentReviewInput {
    baseSha: string;
    headSha: string;
    treeSha: string;
    worktree: string;
    businessContext: string;
    maxTokensBudget: number;
    timeoutMs: number;
    paths: Array<{
        path: string;
        fingerprint: string;
        snapshotPath: string;
    }>;
}
/** Owned native one-shot review. Fresh composition, schema capture, usage and reads all fail closed. */
export declare function runAgentReview(ctx: Context, parent: Agent, rawInput: AgentReviewInput, signal: AbortSignal): Promise<{
    report: string;
    findings: string[];
    reviewerSessionId: string;
}>;
