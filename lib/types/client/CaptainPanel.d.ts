import type { Phase, Run, Task, Ticket, CoordinatorLoopState } from '../captain/types.ts';
export interface CaptainOpenDetail {
    sessionId: string;
    workspace?: string;
}
interface Eligibility {
    ticketId: string;
    eligible: boolean;
    reason: string;
    state?: string;
    predecessors?: string[];
}
interface Snapshot {
    run: Run | null;
    eligibility?: Eligibility[];
    role?: 'idle' | 'coordinator' | 'worker';
    coordinatorSessionId?: string | null;
    coordinatorLoop?: CoordinatorLoopState | null;
}
type ReviewEvidence = NonNullable<Task['reviewHistory']>[number];
/** A stopped run retains its identity and claims; only Resume reactivates it. */
export declare function captainActionAvailability(status: Run['status'] | undefined, loaded: boolean, busy: boolean): {
    start: boolean;
    pause: boolean;
    resume: boolean;
    drain: boolean;
    stop: boolean;
    parallelism: boolean;
};
/** Export data rather than interpreting a report string as a URL or HTML. */
export declare function reviewExport(task: Pick<Task, 'id' | 'ticket'>, review: ReviewEvidence): string;
export declare function CaptainReviewEvidence({ task }: {
    task: Task;
}): import("react").JSX.Element;
/** Bounded DAG layout; cycles stay visible rather than recursing forever. */
export declare function eligibilityGraph(tickets: Pick<Ticket, 'id' | 'title' | 'predecessors'>[]): {
    nodes: {
        x: number;
        y: number;
        missing: boolean;
        id: string;
        title: string;
        predecessors: string[];
    }[];
    edges: {
        from: string;
        to: string;
    }[];
    width: number;
    height: number;
};
export declare function CaptainEligibilityGraph({ tickets, rows }: {
    tickets: Ticket[];
    rows: Eligibility[];
}): import("react").JSX.Element;
export declare function elapsedMs(start: string, end: string | undefined, now: number): number;
export declare function phaseDurations(task: Pick<Task, 'phases' | 'finishedAt'>, now: number): {
    phase: Phase;
    milliseconds: number;
}[];
export declare function webUrl(value: string | undefined): string | undefined;
export declare function CaptainPanel({ sessionId, workspace, onClose, openSession, initialSnapshot }: CaptainOpenDetail & {
    onClose: () => void;
    openSession: (parentId: string, childId: string) => Promise<unknown>;
    initialSnapshot?: Snapshot;
}): import("react").JSX.Element;
export {};
