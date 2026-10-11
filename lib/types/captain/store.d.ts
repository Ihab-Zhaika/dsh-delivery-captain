import type { Run } from './types.ts';
/** A single-host durable store, with exclusive repository leases across DSH processes. */
export declare class RunStore {
    readonly directory: string;
    private readonly leases;
    private writes;
    constructor(directory: string);
    loadAll(): Promise<Run[]>;
    save(run: Run): Promise<void>;
    private lockPath;
    acquire(key: string): Promise<void>;
    release(key: string): Promise<void>;
    dispose(): Promise<void>;
}
