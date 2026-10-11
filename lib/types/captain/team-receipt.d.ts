import type { SessionEvent } from '@deepseek-ai/dsh-session';
interface Inspection {
    meta: {
        id: string;
    };
    inheritedEventCount: number;
    events: readonly SessionEvent[];
}
interface Receipt {
    id: string;
    name: string;
}
/** Public native tool journals prove execution; optional plugin events are not reconstructed by rc.2. */
export declare function originalTeamReceipt(inspection: Inspection, workerId: string, taskId: string): Receipt | undefined;
export {};
