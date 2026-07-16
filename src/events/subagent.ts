/**
 * SubagentStart / SubagentEnd — Grok Build native lifecycle (xai-grok-hooks).
 * Prefer these over assistant-prose for spawn follow-through arm/clear.
 *
 * Host fires these on the **parent** session (see grok-build updates.rs).
 * Never sticky-lock parent agent role to subagentType — that poisons Agent Guard.
 */
import type { EnvConfig, HookInput, HookOutput } from "../protocol/types.js";
import { markSpawnActivity } from "../features/category-discipline.js";
import {
  clearSpawnFollowThrough,
  markSpawnFollowThrough,
} from "../features/spawn-followthrough.js";

function roleOf(input: HookInput): string {
  return (
    input.subagentType ||
    String(input.raw?.subagentType ?? input.raw?.subagent_type ?? "").trim() ||
    ""
  );
}

/** Host SubagentStart — arm follow-through + category spawn mark (parent session). */
export function handleSubagentStart(input: HookInput, cfg: EnvConfig): HookOutput {
  markSpawnActivity(input, cfg);
  const role = roleOf(input);
  markSpawnFollowThrough(input, cfg, role || undefined);
  return {};
}

/** Host SubagentEnd — result recovered; clear follow-through. */
export function handleSubagentEnd(input: HookInput, cfg: EnvConfig): HookOutput {
  clearSpawnFollowThrough(input, cfg);
  return {};
}
