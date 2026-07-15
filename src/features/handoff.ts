import fs from "node:fs";
import path from "node:path";
import type { EnvConfig, HookInput } from "../protocol/types.js";
import { ensureDir, writeTextAtomic } from "../state/fs.js";
import { pathsFor } from "../state/paths.js";

const RESUME_MAX_CHARS = 3_000;

export function detectHandoff(prompt: string): boolean {
  return /^\/handoff\b/i.test(prompt.trim());
}

export function writeHandoffStub(input: HookInput, cfg: EnvConfig, prompt: string): string {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  ensureDir(p.handoffsDir);
  const file = path.join(p.handoffsDir, `${Date.now()}-handoff.md`);
  const body = [
    `# Handoff — ${new Date().toISOString()}`,
    "",
    "## Session",
    `- sessionId: ${input.sessionId}`,
    `- workspace: ${input.workspaceRoot}`,
    "",
    "## Trigger",
    prompt,
    "",
    "## PHASE 0 — Context",
    "(Agent: fill current goal, constraints, branch)",
    "",
    "## PHASE 1 — Done",
    "- ",
    "",
    "## PHASE 2 — In progress",
    "- ",
    "",
    "## PHASE 3 — Next",
    "- ",
    "",
    "## PHASE 4 — Risks / open questions",
    "- ",
    "",
  ].join("\n");
  writeTextAtomic(file, body);
  return file;
}

export function handoffContext(file: string): string {
  return [
    "<OMG_HANDOFF>",
    `Write a complete handoff into: ${file}`,
    "Fill PHASE 0–4. Next session should be able to resume without prior chat.",
    "Include key files, commands run, and unfinished todos.",
    "</OMG_HANDOFF>",
  ].join("\n");
}

/**
 * Newest handoff under .omg/handoffs/ (by mtime, then name).
 * Used at SessionStart so the next chat can resume without re-discovery.
 */
export function findLatestHandoff(
  workspaceRoot: string,
  cfg: EnvConfig,
  sessionId = "default",
): string | null {
  const dir = pathsFor(workspaceRoot, sessionId, cfg).handoffsDir;
  if (!fs.existsSync(dir)) return null;
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith(".md"));
  } catch {
    return null;
  }
  if (!names.length) return null;
  const ranked = names
    .map((n) => {
      const full = path.join(dir, n);
      let mtime = 0;
      try {
        mtime = fs.statSync(full).mtimeMs;
      } catch {
        /* ignore */
      }
      return { full, mtime, n };
    })
    .sort((a, b) => b.mtime - a.mtime || b.n.localeCompare(a.n));
  return ranked[0]?.full || null;
}

/** SessionStart / resume: inject latest handoff excerpt (not a full re-write prompt). */
export function resumeFromHandoffContext(filePath: string): string {
  if (!filePath || !fs.existsSync(filePath)) return "";
  let body = "";
  try {
    body = fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
  const excerpt =
    body.length > RESUME_MAX_CHARS
      ? body.slice(0, RESUME_MAX_CHARS) + "\n\n…[handoff truncated]"
      : body;
  return [
    "<OMG_HANDOFF_RESUME>",
    `Previous session left a handoff. Read and continue from: ${filePath}`,
    "Do not re-plan from zero if PHASE 2/3 already state the next work.",
    "",
    excerpt,
    "</OMG_HANDOFF_RESUME>",
  ].join("\n");
}
