import type { EnvConfig, HookInput, HookOutput } from "../protocol/types.js";
import { refreshCatalog } from "../features/skill-gate.js";
import { sisyphusBootstrap, usingSuperpowersHint } from "../features/rules.js";
import { ensureDir, writeJsonAtomic } from "../state/fs.js";
import { pathsFor, sessionStateRoot } from "../state/paths.js";

export function handleSessionStart(input: HookInput, cfg: EnvConfig): HookOutput {
  ensureDir(sessionStateRoot(cfg));
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  ensureDir(p.session);
  ensureDir(p.omg);

  writeJsonAtomic(p.fingerprint, {
    schemaVersion: 1,
    plugin: "oh-my-grok",
    version: "0.7.0",
    sessionId: input.sessionId,
    workspaceRoot: input.workspaceRoot,
    pid: process.pid,
    at: new Date().toISOString(),
  });

  // Reset prompt count for new session
  writeJsonAtomic(p.promptCount, { n: 0 });

  const catalog = refreshCatalog(input, cfg);

  const additionalContext = [
    sisyphusBootstrap(),
    usingSuperpowersHint(cfg.pluginRoot),
    `[oh-my-grok] SessionStart OK. skills=${catalog.catalog.length} fingerprint=${p.fingerprint}`,
    "Do not dual-enable another oh-my-grok (e.g. mihazs Go edition) — hooks will conflict.",
  ].join("\n\n");

  return { additionalContext };
}
