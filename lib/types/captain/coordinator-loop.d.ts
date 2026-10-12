import type { Context } from '@deepseek-ai/cordis';
import type { CoordinatorLoopAction, CoordinatorLoopState, Run } from './types.ts';
/** Native same-session goal ownership; never implements a second polling loop. */
export declare class CoordinatorLoop {
    private readonly ctx;
    constructor(ctx: Context);
    private service;
    private owned;
    state(run: Run): CoordinatorLoopState;
    control(run: Run, action: CoordinatorLoopAction): Promise<void>;
}
