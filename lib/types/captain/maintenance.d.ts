import type { CommandRunner, RecoveryMaintenance, Task } from './types.ts';
/** Read-only handoff discovery. This never changes the consumer task's Git or provider identity. */
export declare function inspectRecoveryMaintenance(task: Task, ownerRoot: string, loaded: {
    moduleSha256: string;
    build: unknown;
}, run: CommandRunner): Promise<RecoveryMaintenance | undefined>;
