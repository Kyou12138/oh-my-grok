/** Persist last user prompt for Skill Gate intent matching. */
import type { EnvConfig, HookInput } from "../protocol/types.js";
import { ensureDir, readJson, writeJsonAtomic } from "../state/fs.js";
import { pathsFor } from "../state/paths.js";
import { loadRalph } from "./ralph.js";

export interface LastPromptState {
  schemaVersion: 1;
  prompt: string;
  updatedAt: string;
}

export function saveLastPrompt(
  input: HookInput,
  cfg: EnvConfig,
  prompt: string,
): void {
  if (!prompt?.trim()) return;
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  ensureDir(p.session);
  writeJsonAtomic(p.lastPrompt, {
    schemaVersion: 1,
    prompt: prompt.slice(0, 4000),
    updatedAt: new Date().toISOString(),
  } satisfies LastPromptState);
}

export function loadLastPrompt(input: HookInput, cfg: EnvConfig): string {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  const st = readJson<LastPromptState | null>(p.lastPrompt, null);
  return st?.prompt || "";
}

/**
 * Paths that imply test intent (safe to include in skill-gate context).
 * Other paths must NOT enter context — e.g. `plan_executor.ts` / `my-plan.md`
 * falsely triggered writing-plans (v1.1.16).
 */
export function isTestLikePath(filePath: string): boolean {
  if (!filePath?.trim()) return false;
  const n = filePath.replace(/\\/g, "/");
  return (
    /\.(test|spec)\.[a-z0-9]+$/i.test(n) ||
    /\/__tests__\//i.test(n) ||
    /\/tests?\//i.test(n) ||
    /\/spec\//i.test(n)
  );
}

/** Context string for intent-aware skill gate. */
export function skillGateContext(input: HookInput, cfg: EnvConfig): string {
  const parts: string[] = [];
  const last = loadLastPrompt(input, cfg);
  if (last) parts.push(last);
  const ralph = loadRalph(input, cfg);
  if (ralph?.task) parts.push(ralph.task);
  const file = String(
    input.toolInput?.file_path ??
      input.toolInput?.path ??
      input.toolInput?.filePath ??
      input.toolInput?.target_file ??
      "",
  );
  // Only test-like paths contribute path intent (TDD/verification skills)
  if (file && isTestLikePath(file)) parts.push(file);
  return parts.join("\n");
}
