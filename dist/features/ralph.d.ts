import type { EnvConfig, HookInput } from "../protocol/types.js";
export type LoopPhase = "explore" | "implement" | "verify";
export interface RalphState {
    schemaVersion: 2;
    active: boolean;
    mode: "ralph" | "ulw";
    task: string;
    iteration: number;
    maxIterations: number;
    createdAt: string;
    /** ULW phase machine */
    phase: LoopPhase;
    /** explore/implement/verify seen this loop */
    phaseReached: {
        explore: boolean;
        implement: boolean;
        verify: boolean;
    };
    /** consecutive iterations without progress */
    stallCount: number;
    lastActivityAt: string;
    /** last stop fingerprint of activity counters */
    lastActivityFingerprint: string;
}
export interface UlwActivity {
    schemaVersion: 1;
    reads: number;
    writes: number;
    shells: number;
    lastPaths: string[];
    updatedAt: string;
}
export declare function serializeRalphMd(state: RalphState): string;
export declare function loadRalph(input: HookInput, cfg: EnvConfig): RalphState | null;
export declare function startRalph(input: HookInput, cfg: EnvConfig, task: string, mode: "ralph" | "ulw"): RalphState;
export declare function cancelRalph(input: HookInput, cfg: EnvConfig): void;
export declare function bumpRalph(input: HookInput, cfg: EnvConfig, state: RalphState): RalphState;
export declare function saveRalph(input: HookInput, cfg: EnvConfig, state: RalphState): void;
export declare function isDoneMessage(msg?: string): boolean;
/** Detect ralph/ulw start — mid-sentence ulw/ultrawork supported. */
export declare function detectRalphCommand(prompt: string): {
    action: "start-ralph" | "start-ulw" | "cancel" | null;
    task: string;
};
export declare function loadUlwActivity(input: HookInput, cfg: EnvConfig): UlwActivity;
export declare function resetUlwActivity(input: HookInput, cfg: EnvConfig): void;
export declare function noteUlwRead(input: HookInput, cfg: EnvConfig, filePath?: string): void;
export declare function noteUlwWrite(input: HookInput, cfg: EnvConfig, filePath?: string): void;
/** Commands that count as verification evidence for ULW. */
export declare const VERIFY_SHELL_RE: RegExp;
export declare function isVerifyShellCommand(command?: string): boolean;
/**
 * Record shell/terminal activity for ULW.
 * Test/lint/typecheck commands auto-mark verify phase when a ULW loop is active.
 */
export declare function noteUlwShell(input: HookInput, cfg: EnvConfig, command?: string): void;
export declare function activityFingerprint(a: UlwActivity): string;
/** Advance phase from observed activity since last stop. */
export declare function advancePhaseFromActivity(state: RalphState, activity: UlwActivity): RalphState;
export declare function markVerifyReached(state: RalphState): RalphState;
export declare function ulwDoneGate(input: HookInput, cfg: EnvConfig, state: RalphState, msg?: string): {
    ok: boolean;
    reason: string;
};
export declare function writeProgressLog(input: HookInput, cfg: EnvConfig, state: RalphState, kind: string, note: string): void;
export declare function ralphStopReason(state: RalphState, opts?: {
    stall?: boolean;
}): string;
/** Process one Stop event for an active loop. Returns block reason or null if loop ended cleanly. */
export declare function processLoopStop(input: HookInput, cfg: EnvConfig, state: RalphState): {
    block: boolean;
    reason: string;
    state: RalphState;
};
