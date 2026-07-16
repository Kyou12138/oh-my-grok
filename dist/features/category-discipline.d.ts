/**
 * Category discipline gate (v0.10, PreTool host-enforce v1.1.2)
 *
 * Specialist-category work (deep / visual-engineering / ultrabrain) with zero
 * session spawns => yank once recommending specialists.
 *
 * Grok Build only enforces PreToolUse (stdout decision). Stop {decision:block}
 * is discarded by the host — so the primary gate is PreTool on first mutate.
 * Stop handler still calls the same once-per-session logic for tests / future hosts.
 */
import type { EnvConfig, HookInput } from "../protocol/types.js";
export interface CategoryDisciplineState {
    schemaVersion: 1;
    spawnCount: number;
    prompted: boolean;
}
/** Called from post-tool spawn / SubagentStart — bump spawn activity, clear prompted. */
export declare function markSpawnActivity(input: HookInput, cfg: EnvConfig): void;
/**
 * Shared once-per-session yank. Marks prompted when returning a reason.
 * Used by PreTool (host-enforced) and Stop (side-effect / future hosts).
 */
export declare function categoryDisciplineYankReason(input: HookInput, cfg: EnvConfig): string | null;
/**
 * PreTool deny (host-enforced). Call only for mutating tools.
 * Same once flag as Stop so we do not double-yank.
 */
export declare function categoryDisciplinePreDeny(input: HookInput, cfg: EnvConfig): string | null;
/** Stop gate — same once-per-session logic (stdout ignored on current Grok host). */
export declare function categoryDisciplineStopReason(input: HookInput, cfg: EnvConfig): string | null;
