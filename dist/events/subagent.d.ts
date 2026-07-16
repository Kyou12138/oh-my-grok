/**
 * SubagentStart / SubagentEnd — Grok Build native lifecycle (xai-grok-hooks).
 * Prefer these over assistant-prose for spawn follow-through arm/clear.
 */
import type { EnvConfig, HookInput, HookOutput } from "../protocol/types.js";
/** Host SubagentStart — arm follow-through + category spawn mark + sticky role. */
export declare function handleSubagentStart(input: HookInput, cfg: EnvConfig): HookOutput;
/** Host SubagentEnd (alias of SubagentStop in runner) — result recovered. */
export declare function handleSubagentEnd(input: HookInput, cfg: EnvConfig): HookOutput;
