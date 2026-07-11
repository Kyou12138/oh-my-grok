import type { EnvConfig, HookInput } from "../protocol/types.js";
export interface RalphState {
    active: boolean;
    mode: "ralph" | "ulw";
    task: string;
    iteration: number;
    maxIterations: number;
    createdAt: string;
}
export declare function serializeRalph(state: RalphState): string;
export declare function loadRalph(input: HookInput, cfg: EnvConfig): RalphState | null;
export declare function startRalph(input: HookInput, cfg: EnvConfig, task: string, mode: "ralph" | "ulw"): RalphState;
export declare function cancelRalph(input: HookInput, cfg: EnvConfig): void;
export declare function bumpRalph(input: HookInput, cfg: EnvConfig, state: RalphState): RalphState;
export declare function isDoneMessage(msg?: string): boolean;
export declare function detectRalphCommand(prompt: string): {
    action: "start-ralph" | "start-ulw" | "cancel" | null;
    task: string;
};
export declare function ralphStopReason(state: RalphState): string;
