import type { CommandRunner, RunConfig, Task } from './types.ts';
export declare function resolveHead(task: Task, run: CommandRunner): Promise<string>;
export declare function fetchTarget(config: RunConfig, run: CommandRunner, cwd?: string): Promise<string>;
/** Adopt only the exact registered branch/path. Never reset existing work. */
export declare function prepareWorktree(task: Task, config: RunConfig, run: CommandRunner, teamStateDir?: string): Promise<void>;
