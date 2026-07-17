import fs from "node:fs";
import path from "node:path";
import type { EnvConfig, HookInput } from "../protocol/types.js";
import { ensureDir, readJson, removeFile, writeJsonAtomic, writeTextAtomic } from "../state/fs.js";
import { isTargetInside } from "../state/path-boundary.js";
import { pathsFor } from "../state/paths.js";
import {
  getShellCommand,
  isMutatingShellCommand,
  isShellTool,
} from "./agent-guard.js";
import {
  parsePlanTaskCheckboxes,
  seedTodosFromPlanIfEmpty,
  setBoulder,
} from "./todo-boulder.js";
import { pathsFromToolInput } from "./tool-paths.js";

export interface PlanModeState {
  schemaVersion: 1;
  active: boolean;
  topic?: string;
  planFile?: string;
  updatedAt: string;
}

export function loadPlanMode(input: HookInput, cfg: EnvConfig): PlanModeState {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  return readJson<PlanModeState>(p.planMode, {
    schemaVersion: 1,
    active: false,
    updatedAt: "",
  });
}

export function startPlanMode(input: HookInput, cfg: EnvConfig, topic: string): PlanModeState {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  ensureDir(p.plansDir);
  const safe = topic.slice(0, 40).replace(/[^\w\u4e00-\u9fff-]+/g, "-") || "plan";
  const planFile = path.join(p.plansDir, `${Date.now()}-${safe}.md`);
  writeTextAtomic(
    planFile,
    [
      `# Plan: ${topic}`,
      "",
      "## Goal",
      "",
      topic,
      "",
      "## Open questions",
      "",
      "- [ ] ",
      "",
      "## Steps",
      "",
      "- [ ] ",
      "",
      "## Success criteria",
      "",
      "- [ ] ",
      "",
      "## Review",
      "",
      "Required before `/start-work` — check items only after real Metis/Momus review:",
      "",
      "- [ ] Metis gap analysis (spawn metis first)",
      "- [ ] Momus plan review (spawn momus; then record result below)",
      "",
      "After real review: check the boxes above, or append a Momus result line that starts with VERDICT followed by colon and PASS.",
      "",
    ].join("\n"),
  );
  const state: PlanModeState = {
    schemaVersion: 1,
    active: true,
    topic,
    planFile,
    updatedAt: new Date().toISOString(),
  };
  writeJsonAtomic(p.planMode, state);
  return state;
}

export function endPlanMode(input: HookInput, cfg: EnvConfig): void {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  removeFile(p.planMode);
}

/**
 * Host enter_plan_mode tool — arm plan-mode gate without forcing a new plan file.
 * If already active, keep existing planFile/topic.
 */
export function activateHostPlanMode(
  input: HookInput,
  cfg: EnvConfig,
  topic = "enter_plan_mode",
): PlanModeState {
  const existing = loadPlanMode(input, cfg);
  if (existing.active) {
    return existing;
  }
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  ensureDir(p.plansDir);
  const state: PlanModeState = {
    schemaVersion: 1,
    active: true,
    topic: topic.slice(0, 80) || "enter_plan_mode",
    planFile: existing.planFile,
    updatedAt: new Date().toISOString(),
  };
  writeJsonAtomic(p.planMode, state);
  return state;
}

/** Normalize host plan tool names (enter_plan_mode / exit_plan_mode / CamelCase). */
export function isHostEnterPlanTool(toolName?: string): boolean {
  if (!toolName) return false;
  const n = toolName.toLowerCase().replace(/[^a-z]/g, "");
  return n === "enterplanmode" || n.includes("enterplanmode");
}

export function isHostExitPlanTool(toolName?: string): boolean {
  if (!toolName) return false;
  const n = toolName.toLowerCase().replace(/[^a-z]/g, "");
  return n === "exitplanmode" || n.includes("exitplanmode");
}

/**
 * Plan must show real review evidence before boulder execution.
 * Only checked markdown items or VERDICT:PASS on a non-unchecked line count.
 * Unchecked template prose (e.g. "- [ ] Momus … VERDICT") must NOT pass.
 */
export function planFileHasReview(planPath?: string): boolean {
  if (!planPath || !fs.existsSync(planPath)) return false;
  let text = "";
  try {
    text = fs.readFileSync(planPath, "utf8");
  } catch {
    return false;
  }
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    // Unchecked checklist — never evidence (even if it mentions Metis/VERDICT).
    // GFM list markers: - * + (align hasOpenPlanCheckboxes).
    if (/^[-*+]\s*\[\s*\]/.test(t)) continue;
    // Checked item about review / Metis / Momus
    if (
      /^[-*+]\s*\[x\]/i.test(t) &&
      /(metis|momus|review|评审|verdict)/i.test(t)
    ) {
      return true;
    }
    // Explicit Momus-style result line only (not instructional prose)
    if (/^VERDICT:\s*PASS\b/i.test(t) || /^\*\*VERDICT:\s*PASS\b/i.test(t)) {
      return true;
    }
  }
  return false;
}

export function planReviewDenyReason(planPath?: string): string {
  return [
    "[PLAN_REVIEW] /start-work blocked — plan lacks review evidence.",
    planPath ? `Plan: ${planPath}` : "No active plan file.",
    "",
    "Before executing, complete the review chain:",
    "1) Spawn **metis** (read-only) — gaps / ambiguities",
    "2) Spawn **momus** (read-only) — VERDICT: PASS|FAIL",
    "3) In the plan markdown under ## Review, check items or write VERDICT: PASS",
    "4) Re-run /start-work",
  ].join("\n");
}

/**
 * Count machine-readable task checkboxes outside ## Review (omo #6094).
 * Empty placeholders (`- [ ]` with no label) do not count — Boulder needs
 * labeled rows like `- [ ] 1. Implement …`.
 */
export function countPlanTaskCheckboxes(planPath?: string): number {
  if (!planPath || !fs.existsSync(planPath)) return 0;
  let text = "";
  try {
    text = fs.readFileSync(planPath, "utf8");
  } catch {
    return 0;
  }
  return parsePlanTaskCheckboxes(text).length;
}

export function planFormatDenyReason(planPath?: string): string {
  return [
    "[PLAN_FORMAT] /start-work blocked — plan has zero machine-readable task checkboxes (omo #6094).",
    planPath ? `Plan: ${planPath}` : "No plan path.",
    "",
    "Boulder cannot track prose-only task lists. Every implementation task MUST be a GFM checkbox with a label:",
    "  - [ ] 1. Implement settlement flow",
    "  - [ ] 2. Add regression coverage",
    "",
    "Do not use numbered headings or bold prose as tasks. Empty `- [ ]` placeholders do not count.",
    "Add labeled rows under ## Steps / ## Todos (outside ## Review), then re-run /start-work.",
  ].join("\n");
}

export function startWorkFromPlan(
  input: HookInput,
  cfg: EnvConfig,
): { ok: boolean; planPath: string; reason?: string } {
  const pm = loadPlanMode(input, cfg);
  const planPath = pm.planFile || "";
  if (!planPath) {
    return {
      ok: false,
      planPath: "",
      reason: "[PLAN_REVIEW] No active plan. Run /plan first.",
    };
  }
  if (!planFileHasReview(planPath)) {
    return { ok: false, planPath, reason: planReviewDenyReason(planPath) };
  }
  // omo #6094: review-only / prose-only plans must not arm boulder at 0/0
  if (countPlanTaskCheckboxes(planPath) === 0) {
    return { ok: false, planPath, reason: planFormatDenyReason(planPath) };
  }
  setBoulder(input, cfg, {
    schemaVersion: 1,
    active: true,
    planPath,
    title: pm.topic || "start-work",
    notes: "Activated via /start-work (Atlas/Sisyphus execution) after plan review.",
    updatedAt: new Date().toISOString(),
  });
  // omo #6066: seed todos from plan tasks so Stop continuation tracks work like a Goal
  seedTodosFromPlanIfEmpty(input, cfg, planPath);
  endPlanMode(input, cfg);
  return { ok: true, planPath };
}

export function detectPlanCommand(prompt: string): {
  action: "plan" | "start-work" | null;
  topic: string;
} {
  const p = prompt.trim();
  if (/^\/start-work\b/i.test(p)) return { action: "start-work", topic: "" };
  const m =
    p.match(/^\/plan(?:\s+["']?(.+?)["']?)?\s*$/i) ||
    p.match(/^\/prometheus(?:\s+["']?(.+?)["']?)?\s*$/i);
  if (m) return { action: "plan", topic: (m[1] || "untitled plan").trim() };
  return { action: null, topic: "" };
}

export function isPlanWritePath(
  input: HookInput,
  cfg: EnvConfig,
  file: string,
): boolean {
  if (!file?.trim()) return false;
  const plansDir = pathsFor(input.workspaceRoot, input.sessionId, cfg).plansDir;
  return isTargetInside({
    boundary: plansDir,
    baseDir: input.workspaceRoot || input.cwd,
    target: file,
  });
}

/**
 * True when plan-mode is active and every path in this tool call is under .omg/plans/.
 * Used to skip Skill Gate on pure plan markdown edits (v1.1.26).
 */
export function isPlanModePlanOnlyWrite(
  input: HookInput,
  cfg: EnvConfig,
): boolean {
  if (!cfg.planMode) return false;
  const pm = loadPlanMode(input, cfg);
  if (!pm.active) return false;
  const paths = pathsFromToolInput(input.toolInput);
  if (!paths.length) return false;
  return paths.every((file) => isPlanWritePath(input, cfg, file));
}

export function planModeDeny(input: HookInput, cfg: EnvConfig): string | null {
  if (!cfg.planMode) return null;
  const pm = loadPlanMode(input, cfg);
  if (!pm.active) return null;

  // v1.1.36: shell used to short-circuit before plan-mode (not isMutatingTool)
  if (isShellTool(input.toolName)) {
    const cmd = getShellCommand(input);
    if (isMutatingShellCommand(cmd)) {
      return [
        "[Prometheus plan-mode] Mutating shell blocked while planning.",
        `Command: ${cmd.slice(0, 200)}${cmd.length > 200 ? "…" : ""}`,
        "Write only under `.omg/plans/` via file tools, or /start-work to execute.",
      ].join("\n");
    }
    return null; // ls / git status / npm test ok during planning
  }

  // v1.1.22: MultiEdit may hide business paths under edits[] — check all
  const paths = pathsFromToolInput(input.toolInput);
  if (!paths.length) {
    return "[Prometheus plan-mode] Specify a path under .omg/plans/ while planning. Other writes denied.";
  }
  const blocked = paths.filter((file) => !isPlanWritePath(input, cfg, file));
  if (!blocked.length) return null;
  return [
    "[Prometheus plan-mode] Only writes under .omg/plans/ are allowed.",
    `Blocked path: ${blocked[0]}${blocked.length > 1 ? ` (+${blocked.length - 1} more)` : ""}`,
    "Finish the plan, then /start-work to execute (Atlas/boulder).",
  ].join("\n");
}

/**
 * Sticky / host role **prometheus** may only mutate plan paths (even outside /plan session).
 * Spawn of metis/momus is allowed (handled separately — this only checks mutating tools + shell).
 */
export function prometheusRoleDeny(
  input: HookInput,
  cfg: EnvConfig,
  role: string,
): string | null {
  if (!cfg.agentGuard && !cfg.planMode) return null;
  const r = (role || "").toLowerCase().trim();
  if (r !== "prometheus" && r !== "oh-my-grok:prometheus") return null;

  // v1.1.36: plan-only role must not shell-write implementation paths
  if (isShellTool(input.toolName)) {
    const cmd = getShellCommand(input);
    if (isMutatingShellCommand(cmd)) {
      return [
        "[PROMETHEUS_ROLE] Mutating shell blocked — Prometheus is plan-only.",
        `Command: ${cmd.slice(0, 200)}${cmd.length > 200 ? "…" : ""}`,
        "Write plans under `.omg/plans/`, or /agent sisyphus|hephaestus to implement.",
      ].join("\n");
    }
    return null;
  }

  // only when mutating (caller should pass mutating tools)
  const paths = pathsFromToolInput(input.toolInput);
  if (!paths.length) {
    return [
      "[PROMETHEUS_ROLE] Prometheus may only write under .omg/plans/.",
      "How to fix: set path to a plan file, or /agent sisyphus to implement.",
    ].join("\n");
  }
  const blocked = paths.filter((file) => !isPlanWritePath(input, cfg, file));
  if (!blocked.length) return null;
  return [
    "[PROMETHEUS_ROLE] Prometheus is plan-only — implementation paths blocked.",
    `Blocked path: ${blocked[0]}${blocked.length > 1 ? ` (+${blocked.length - 1} more)` : ""}`,
    "Write plans under .omg/plans/, then /start-work or /agent hephaestus|sisyphus to execute.",
  ].join("\n");
}

export function planModeContext(pm: PlanModeState): string {
  if (!pm.active) return "";
  return [
    "<OMG_PROMETHEUS>",
    "PLAN MODE active. Interview the user; refine scope; write ONLY to .omg/plans/*.md.",
    pm.topic ? `Topic: ${pm.topic}` : "",
    pm.planFile ? `Plan file: ${pm.planFile}` : "",
    "",
    "Review chain (before /start-work):",
    "1) **Metis** (plan consultant) — spawn read-only: find hidden intent, ambiguities, AI failure points.",
    "2) **Momus** (plan reviewer) — spawn read-only: validate clarity, verifiability, completeness.",
    "3) Fold review feedback into the plan markdown checkboxes.",
    "4) User runs /start-work → Atlas/boulder execution.",
    "When plan is approved, user runs /start-work to enter boulder execution.",
    "</OMG_PROMETHEUS>",
  ]
    .filter(Boolean)
    .join("\n");
}
