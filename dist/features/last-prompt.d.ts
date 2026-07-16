/** Persist last user prompt for Skill Gate intent matching. */
import type { EnvConfig, HookInput } from "../protocol/types.js";
export interface LastPromptState {
    schemaVersion: 1;
    prompt: string;
    updatedAt: string;
}
export declare function saveLastPrompt(input: HookInput, cfg: EnvConfig, prompt: string): void;
export declare function loadLastPrompt(input: HookInput, cfg: EnvConfig): string;
/**
 * Paths that imply test intent (safe to include in skill-gate context).
 * Other paths must NOT enter context — e.g. `plan_executor.ts` / `my-plan.md`
 * falsely triggered writing-plans (v1.1.16).
 */
export declare function isTestLikePath(filePath: string): boolean;
/** Context string for intent-aware skill gate. */
export declare function skillGateContext(input: HookInput, cfg: EnvConfig): string;
