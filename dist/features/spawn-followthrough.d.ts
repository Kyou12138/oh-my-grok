import type { EnvConfig, HookInput } from "../protocol/types.js";
export declare const SPAWN_FOLLOWTHROUGH_MAX_YANKS = 2;
export interface SpawnFollowThroughState {
    schemaVersion: 2;
    /** Armed until progress or max yanks exhausted. */
    pending: boolean;
    lastRole?: string;
    /** How many times we blocked this wave (Stop). */
    yankCount: number;
    /** Host SubagentEnd fired — child done; parent still must integrate. */
    childFinished?: boolean;
    /** PreTool already soft-denied once this wave (host-enforced). */
    preToolYanked?: boolean;
    updatedAt: string;
}
/** PostTool spawn / SubagentStart — arm / re-arm follow-through for result recovery. */
export declare function markSpawnFollowThrough(input: HookInput, cfg: EnvConfig, role?: string): void;
/**
 * SubagentEnd: child exited — keep pending so parent still integrates.
 * Does not clear follow-through (v1.1.3).
 */
export declare function markSubagentChildFinished(input: HookInput, cfg: EnvConfig, role?: string): void;
/** Clear pending after get_task_output / inline subagent result / real progress. */
export declare function clearSpawnFollowThrough(input: HookInput, cfg: EnvConfig): void;
/**
 * PreTool deny (host-enforced, once per wave).
 * Only when childFinished — allows parallel parent edits while subagent still runs.
 * Call only for mutating tools.
 */
export declare function spawnFollowThroughPreDeny(input: HookInput, cfg: EnvConfig): string | null;
export declare function isSpawnFollowThroughPending(input: HookInput, cfg: EnvConfig): boolean;
/** Tools that fetch subagent/shell task output → result recovered. */
export declare function isResultRecoveryTool(toolName?: string): boolean;
/**
 * Sync spawn already returned a substantial payload (not just "started").
 * Heuristic: long output with evidence-ish content, or recovered-message shape.
 */
export declare function isInlineSubagentResult(toolOutput?: string): boolean;
/**
 * "I spawned explore" / "dispatched hephaestus" without concrete results.
 * Long messages with evidence keywords are NOT spawn-announce.
 */
export declare function isSpawnAnnounceMessage(msg?: string): boolean;
/** Evidence that parent recovered/used subagent output (not just dispatched). */
export declare function isSpawnResultRecoveredMessage(msg?: string): boolean;
/**
 * Stop gate: pending + (idle | spawn-announce) => block up to MAX_YANKS.
 * Progress or result-recovery language clears pending.
 */
export declare function spawnFollowThroughStopReason(input: HookInput, cfg: EnvConfig): string | null;
