import type { AgentReviewInput } from './agent-review.ts';
import type { CommandRunner, Phase, ReviewResult, RunConfig, Task } from './types.ts';
export declare function ocrTokensBudget(config: RunConfig): number;
export declare function reviewPolicyStamp(config: RunConfig): string;
/** OCR's versioned manifest is authoritative; exit zero alone may mean partial coverage. */
export declare function parseOcrReport(text: string, head: string, base: string, changedPaths: string[]): string[];
export type IndependentReviewRunner = (input: AgentReviewInput, signal: AbortSignal) => Promise<{
    report: string;
    findings: string[];
    reviewerSessionId: string;
}>;
/** Preserve every source character while keeping native read's 2,000-char lines inspectable. */
export declare function formatReviewSnapshot(content: string): string;
export declare function reviewTask(task: Task, config: RunConfig, run: CommandRunner, onPhase?: (phase: Phase) => Promise<void>, signal?: AbortSignal, agentReview?: IndependentReviewRunner): Promise<ReviewResult>;
/** Cheap cache validation; a cached pass is evidence for one exact clean range only. */
export declare function isReviewCurrent(task: Task, config: RunConfig, review: ReviewResult, run: CommandRunner, signal?: AbortSignal): Promise<boolean>;
