import type { EnvConfig, HookInput } from "../protocol/types.js";
export interface SpawnFollowThroughState {
    schemaVersion: 1;
    /** Set true on each spawn; cleared after follow-through yank or real progress. */
    pending: boolean;
    lastRole?: string;
    updatedAt: string;
}
/** PostTool spawn — arm follow-through for next Stop. */
export declare function markSpawnFollowThrough(input: HookInput, cfg: EnvConfig, role?: string): void;
/**
 * "I spawned explore" / "dispatched hephaestus" without concrete results.
 * Long messages with evidence keywords are NOT spawn-announce.
 */
export declare function isSpawnAnnounceMessage(msg?: string): boolean;
/**
 * Stop gate: pending follow-through + (idle | spawn-announce) => block once.
 * Real progress clears pending without blocking.
 */
export declare function spawnFollowThroughStopReason(input: HookInput, cfg: EnvConfig): string | null;
