import type { CommandRunner, RepositoryContext, RunConfig } from './types.ts';
export declare function discoverRepository(cwd: string, provider?: RunConfig['provider'], runner?: CommandRunner): Promise<RepositoryContext>;
/** UI preferences can change; repository identity always belongs to the current session. */
export declare function bindRepositoryConfig(context: RepositoryContext, raw: unknown): RunConfig;
