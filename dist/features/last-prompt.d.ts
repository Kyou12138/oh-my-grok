/** Persist last user prompt for Skill Gate intent matching. */
import type { EnvConfig, HookInput } from "../protocol/types.js";
export interface LastPromptState {
    schemaVersion: 1;
    prompt: string;
    updatedAt: string;
}
export declare function saveLastPrompt(input: HookInput, cfg: EnvConfig, prompt: string): void;
export declare function loadLastPrompt(input: HookInput, cfg: EnvConfig): string;
/** Context string for intent-aware skill gate. */
export declare function skillGateContext(input: HookInput, cfg: EnvConfig): string;
