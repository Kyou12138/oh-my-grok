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
/**
 * Plan must show real review evidence before boulder execution.
 * Only checked markdown items or VERDICT:PASS on a non-unchecked line count.
 * Unchecked template prose (e.g. "- [ ] Momus … VERDICT") must NOT pass.
 */
export declare function planFileHasReview(planPath?: string): boolean;
export declare function planReviewDenyReason(planPath?: string): string;
export declare function startWorkFromPlan(input: HookInput, cfg: EnvConfig): {
    ok: boolean;
    planPath: string;
    reason?: string;
};
export declare function detectPlanCommand(prompt: string): {
    action: "plan" | "start-work" | null;
    topic: string;
};
export declare function planModeDeny(input: HookInput, cfg: EnvConfig): string | null;
export declare function planModeContext(pm: PlanModeState): string;
