import type { CommandRunner, Phase, ReviewResult, RunConfig, Task } from './types.ts';
/** OCR's versioned manifest is authoritative; exit zero alone may mean partial coverage. */
export declare function parseOcrReport(text: string, head: string, base: string, changedPaths: string[]): string[];
export declare function reviewTask(task: Task, config: RunConfig, run: CommandRunner, onPhase?: (phase: Phase) => Promise<void>, signal?: AbortSignal): Promise<ReviewResult>;
/** Cheap cache validation; a cached pass is evidence for one exact clean range only. */
export declare function isReviewCurrent(task: Task, config: RunConfig, review: ReviewResult, run: CommandRunner, signal?: AbortSignal): Promise<boolean>;
