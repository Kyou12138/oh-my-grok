/**
 * Lightweight SessionStart resume summary — active ULW/Ralph, boulder, handoff pointer.
 * Not full project-memory; reads existing .omg state only.
 */
import type { EnvConfig, HookInput } from "../protocol/types.js";
export declare function sessionResumeSummary(input: HookInput, cfg: EnvConfig): string;
