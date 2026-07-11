import type { EnvConfig, HookInput, HookOutput } from "../protocol/types.js";
import { writeJsonAtomic } from "../state/fs.js";
import { pathsFor } from "../state/paths.js";

export function handleSessionEnd(input: HookInput, cfg: EnvConfig): HookOutput {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  writeJsonAtomic(p.promptCount, { n: 0 });
  // leave ralph/boulder for cross-session; only clear ephemeral pause if desired
  return {};
}
