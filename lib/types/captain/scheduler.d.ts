import type { RunConfig, Task, Ticket } from './types.ts';
export interface Eligibility {
    ticketId: string;
    eligible: boolean;
    reason: string;
    state: string;
    predecessors: string[];
    scope?: 'milestone' | 'unmilestoned' | 'predecessor';
    requiredFor?: string[];
    milestoneRank: number;
    priority: number;
}
export type IntakePolicy = Pick<RunConfig, 'includeUnmilestoned' | 'includeRequiredPredecessors' | 'ticketIds'>;
type DependencyTask = Pick<Task, 'ticket' | 'status' | 'closedAt'> & Partial<Pick<Task, 'error'>>;
/** Fresh remote proofs can use this without applying intake filters or existing-task exclusion. */
export declare function dependencyBlocker(ticket: Ticket, tickets: Ticket[], tasks?: DependencyTask[]): string | undefined;
/** Resolve the complete predecessor closure; related links never enter this graph. */
export declare function eligibility(tickets: Ticket[], milestones: string[], tasks: DependencyTask[], policy?: IntakePolicy): Eligibility[];
/** Parked human waiting is visible wall time but does not spend the task's execution budget. */
export declare function taskDeadline(task: Pick<Task, 'startedAt' | 'phases' | 'finishedAt'> & Partial<Pick<Task, 'budgetStartedAt'>>, minutes: number, now?: number): number;
/** Wall-clock phase intervals partition time; never sum parallel agent effort into these. */
export declare function phaseDurations(task: Pick<Task, 'phases' | 'finishedAt'>, now?: number): Record<string, number>;
/** Validate the UI/command payload without admitting arbitrary configuration fields. */
export declare function validateConfig(raw: unknown): RunConfig;
export declare function taskConfig(config: RunConfig, ticketId: string): RunConfig;
export declare function taskDeliveryConfig(task: Pick<Task, 'ticket' | 'assignmentConfig'>, config: RunConfig): RunConfig;
export {};
