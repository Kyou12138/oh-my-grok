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
import { markSpawnActivity } from "../features/category-discipline.js";
import {
  markSpawnFollowThrough,
  markSubagentChildFinished,
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

/**
 * Host SubagentEnd — child process finished.
 * Keep follow-through pending so parent still recovers/integrates (v1.1.3).
 */
export function handleSubagentEnd(input: HookInput, cfg: EnvConfig): HookOutput {
  markSubagentChildFinished(input, cfg, roleOf(input) || undefined);
  return {};
}
