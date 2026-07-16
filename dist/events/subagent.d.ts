/**
 * SubagentStart / SubagentEnd — Grok Build native lifecycle (xai-grok-hooks).
 * Prefer these over assistant-prose for spawn follow-through arm/clear.
 *
 * Host fires these on the **parent** session (see grok-build updates.rs).
 * Never sticky-lock parent agent role to subagentType — that poisons Agent Guard.
 */
import type { EnvConfig, HookInput, HookOutput } from "../protocol/types.js";
/** Host SubagentStart — arm follow-through + category spawn mark (parent session). */
export declare function handleSubagentStart(input: HookInput, cfg: EnvConfig): HookOutput;
/** Host SubagentEnd — result recovered; clear follow-through. */
export declare function handleSubagentEnd(input: HookInput, cfg: EnvConfig): HookOutput;
