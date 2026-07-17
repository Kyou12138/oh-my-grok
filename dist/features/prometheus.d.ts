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
 * Host enter_plan_mode tool — arm plan-mode gate without forcing a new plan file.
 * If already active, keep existing planFile/topic.
 */
export declare function activateHostPlanMode(input: HookInput, cfg: EnvConfig, topic?: string): PlanModeState;
/** Normalize host plan tool names (enter_plan_mode / exit_plan_mode / CamelCase). */
export declare function isHostEnterPlanTool(toolName?: string): boolean;
export declare function isHostExitPlanTool(toolName?: string): boolean;
/**
 * Plan must show real review evidence before boulder execution.
 * Only checked markdown items or VERDICT:PASS on a non-unchecked line count.
 * Unchecked template prose (e.g. "- [ ] Momus … VERDICT") must NOT pass.
 */
export declare function planFileHasReview(planPath?: string): boolean;
export declare function planReviewDenyReason(planPath?: string): string;
/**
 * Count machine-readable task checkboxes outside ## Review (omo #6094).
 * Empty placeholders (`- [ ]` with no label) do not count — Boulder needs
 * labeled rows like `- [ ] 1. Implement …`.
 */
export declare function countPlanTaskCheckboxes(planPath?: string): number;
export declare function planFormatDenyReason(planPath?: string): string;
export declare function startWorkFromPlan(input: HookInput, cfg: EnvConfig): {
    ok: boolean;
    planPath: string;
    reason?: string;
};
export declare function detectPlanCommand(prompt: string): {
    action: "plan" | "start-work" | null;
    topic: string;
};
export declare function isPlanWritePath(input: HookInput, cfg: EnvConfig, file: string): boolean;
/**
 * True when plan-mode is active and every path in this tool call is under .omg/plans/.
 * Used to skip Skill Gate on pure plan markdown edits (v1.1.26).
 */
export declare function isPlanModePlanOnlyWrite(input: HookInput, cfg: EnvConfig): boolean;
export declare function planModeDeny(input: HookInput, cfg: EnvConfig): string | null;
/**
 * Sticky / host role **prometheus** may only mutate plan paths (even outside /plan session).
 * Spawn of metis/momus is allowed (handled separately — this only checks mutating tools + shell).
 */
export declare function prometheusRoleDeny(input: HookInput, cfg: EnvConfig, role: string): string | null;
export declare function planModeContext(pm: PlanModeState): string;
