import type { Run, Task } from './types.ts';
export declare function backlogFingerprint(run: Run): string;
export declare function needsBacklogRecovery(run: Run): boolean;
export declare function backlogRecoveryReason(run: Run): string;
export declare function recoveryTask(run: Run, repositoryKey: string): Task;
export declare function recoveryFacts(run: Run): string;
