import type { EnvConfig, HookInput } from "../protocol/types.js";
export interface PlanModeState {
    schemaVersion: 1;
    active: boolean;
    topic?: string;
    planFile?: string;
    updatedAt: string;
}
export declare function loadPlanMode(input: HookInput, cfg: EnvConfig): PlanModeState;
export declare function startPlanMode(input: HookInput, cfg: EnvConfig, topic: string): PlanModeState;
export declare function endPlanMode(input: HookInput, cfg: EnvConfig): void;
export declare function startWorkFromPlan(input: HookInput, cfg: EnvConfig): string;
export declare function detectPlanCommand(prompt: string): {
    action: "plan" | "start-work" | null;
    topic: string;
};
export declare function planModeDeny(input: HookInput, cfg: EnvConfig): string | null;
export declare function planModeContext(pm: PlanModeState): string;
