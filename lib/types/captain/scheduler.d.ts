import type { RunConfig, Task, Ticket } from './types.ts';
export interface Eligibility {
    ticketId: string;
    eligible: boolean;
    reason: string;
}
/** Resolve the complete predecessor closure; related links never enter this graph. */
export declare function eligibility(tickets: Ticket[], milestones: string[], tasks: Pick<Task, 'ticket' | 'status' | 'closedAt'>[]): Eligibility[];
/** Wall-clock phase intervals partition time; never sum parallel agent effort into these. */
export declare function phaseDurations(task: Pick<Task, 'phases' | 'finishedAt'>, now?: number): Record<string, number>;
/** Validate the UI/command payload without admitting arbitrary configuration fields. */
export declare function validateConfig(raw: unknown): RunConfig;
