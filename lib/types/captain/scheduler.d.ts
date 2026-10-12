import type { RunConfig, Task, Ticket } from './types.ts';
export interface Eligibility {
    ticketId: string;
    eligible: boolean;
    reason: string;
    state: string;
    predecessors: string[];
}
/** Resolve the complete predecessor closure; related links never enter this graph. */
export declare function eligibility(tickets: Ticket[], milestones: string[], tasks: (Pick<Task, 'ticket' | 'status' | 'closedAt'> & Partial<Pick<Task, 'error'>>)[]): Eligibility[];
/** Parked human waiting is visible wall time but does not spend the task's execution budget. */
export declare function taskDeadline(task: Pick<Task, 'startedAt' | 'phases' | 'finishedAt'> & Partial<Pick<Task, 'budgetStartedAt'>>, minutes: number, now?: number): number;
/** Wall-clock phase intervals partition time; never sum parallel agent effort into these. */
export declare function phaseDurations(task: Pick<Task, 'phases' | 'finishedAt'>, now?: number): Record<string, number>;
/** Validate the UI/command payload without admitting arbitrary configuration fields. */
export declare function validateConfig(raw: unknown): RunConfig;
export declare function taskConfig(config: RunConfig, ticketId: string): RunConfig;
export declare function taskDeliveryConfig(task: Pick<Task, 'ticket' | 'assignmentConfig'>, config: RunConfig): RunConfig;
