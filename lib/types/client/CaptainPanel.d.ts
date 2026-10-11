import type { Phase, Run, Task } from '../captain/types.ts';
export declare const CAPTAIN_OPEN_EVENT = "darkingdoom:open";
export interface CaptainOpenDetail {
    sessionId: string;
    workspace?: string;
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
export declare function elapsedMs(start: string, end: string | undefined, now: number): number;
export declare function phaseDurations(task: Pick<Task, 'phases' | 'finishedAt'>, now: number): {
    phase: Phase;
    milliseconds: number;
}[];
export declare function webUrl(value: string | undefined): string | undefined;
export declare function CaptainSurface({ openSession }: {
    openSession: (parentId: string, childId: string) => Promise<unknown>;
}): import("react").JSX.Element | null;
export declare function CaptainPanel({ sessionId, workspace, onClose, openSession }: CaptainOpenDetail & {
    onClose: () => void;
    openSession: (parentId: string, childId: string) => Promise<unknown>;
}): import("react").JSX.Element;
export {};
