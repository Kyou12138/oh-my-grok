/**
 * SubagentStart / SubagentEnd — Grok Build native lifecycle (xai-grok-hooks).
 *
 * Host fires these on the **parent** session (see grok-build updates.rs).
 * Never sticky-lock parent agent role to subagentType — that poisons Agent Guard.
 *
 * Start: arm follow-through (parent must recover/integrate results).
 * End: child finished ≠ parent integrated — do NOT clear follow-through
 * (clear via get_task_output / progress / recovered language instead).
 */
import type { EnvConfig, HookInput, HookOutput } from "../protocol/types.js";
/** Host SubagentStart — arm follow-through + category spawn mark (parent session). */
export declare function handleSubagentStart(input: HookInput, cfg: EnvConfig): HookOutput;
/**
 * Host SubagentEnd — child process finished.
 * Keep follow-through pending so parent still recovers/integrates (v1.1.3).
 */
export declare function handleSubagentEnd(input: HookInput, cfg: EnvConfig): HookOutput;
