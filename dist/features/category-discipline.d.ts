/**
 * Category discipline gate (v0.10) — specialist-category work
 * (deep / visual-engineering / ultrabrain) with zero session spawns
 * => block Stop once with recommended specialists. Resets on first spawn.
 */
import type { EnvConfig, HookInput } from "../protocol/types.js";
export interface CategoryDisciplineState {
    schemaVersion: 1;
    spawnCount: number;
    prompted: boolean;
}
/** Called from post-tool spawn handler — bump spawn activity, clear prompted. */
export declare function markSpawnActivity(input: HookInput, cfg: EnvConfig): void;
/** Stop gate: specialist work + zero spawns => block once per session. */
export declare function categoryDisciplineStopReason(input: HookInput, cfg: EnvConfig): string | null;
