import type { CommandRunner } from './types.js';
/** Never run ticket/branch text through a shell, including Windows az.cmd. */
export declare const runCommand: CommandRunner;
