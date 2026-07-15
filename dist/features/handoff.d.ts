import type { EnvConfig, HookInput } from "../protocol/types.js";
export declare function detectHandoff(prompt: string): boolean;
export declare function writeHandoffStub(input: HookInput, cfg: EnvConfig, prompt: string): string;
export declare function handoffContext(file: string): string;
/**
 * Newest handoff under .omg/handoffs/ (by mtime, then name).
 * Used at SessionStart so the next chat can resume without re-discovery.
 */
export declare function findLatestHandoff(workspaceRoot: string, cfg: EnvConfig, sessionId?: string): string | null;
/** SessionStart / resume: inject latest handoff excerpt (not a full re-write prompt). */
export declare function resumeFromHandoffContext(filePath: string): string;
