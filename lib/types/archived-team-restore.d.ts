import type { Context } from '@deepseek-ai/cordis';
export declare const ARCHIVED_TEAM_RESTORE_SCHEMA = "agent-teams/archive-restore/v1";
export declare const ARCHIVED_TEAM_RESTORE_RECEIPT = ".archive-restore-receipt.json";
/**
 * Register the exact-original-captain archived state restoration tool.
 * @param ctx - Native tools and Agent registry owning the effect.
 * @param config - Original AgentTeams state directory under the native workspace.
 * @returns Nothing; the native registry owns registration and unload cleanup.
 */
export declare function registerArchivedTeamRestoreTool(ctx: Context, config: {
    stateDir: string;
}): void;
