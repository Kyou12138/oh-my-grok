import fs from "node:fs";
import path from "node:path";
import type { EnvConfig, HookInput } from "../protocol/types.js";
import { ensureDir, readJson, readText, removeFile, writeJsonAtomic } from "../state/fs.js";
import {
  canonicalizeTargetPath,
  isTargetInside,
} from "../state/path-boundary.js";
import { pathsFor } from "../state/paths.js";

export interface TodoItem {
  id?: string;
  content: string;
  status: string;
}

export interface TodoMirror {
  schemaVersion: 1;
  sessionId: string;
  todos: TodoItem[];
  updatedAt: string;
}

export interface BoulderState {
  schemaVersion: 1;
  active: boolean;
  planPath?: string;
  title?: string;
  notes?: string;
  updatedAt: string;
}

export interface TodoEnforcerState {
  schemaVersion: 1 | 2;
  lastContinueAt: number;
  consecutiveContinues: number;
  /** Fingerprint of open todos at last yank — omo-style stagnation (issue #6133 parity). */
  lastOpenFingerprint?: string;
  stagnationCount?: number;
}

export function fingerprintOpenTodos(todos: TodoItem[]): string {
  return todos
    .map((t) => `${t.id || ""}|${(t.status || "").toLowerCase()}|${t.content || ""}`)
    .sort()
    .join("\n");
}

export interface StopPauseState {
  paused: boolean;
  updatedAt: string;
}

export function mirrorTodos(input: HookInput, cfg: EnvConfig, todos: TodoItem[]): void {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  ensureDir(p.todosDir);
  writeJsonAtomic(p.todosFile, {
    schemaVersion: 1,
    sessionId: input.sessionId,
    todos,
    updatedAt: new Date().toISOString(),
  } satisfies TodoMirror);
}

export function loadTodosMirror(input: HookInput, cfg: EnvConfig): TodoItem[] {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  const mirror = readJson<TodoMirror | null>(p.todosFile, null);
  return mirror?.todos?.length ? mirror.todos : [];
}

/**
 * Grok todo_write defaults merge=true (partial updates by id).
 * Explicit false → full replace.
 */
export function isTodoMergeMode(toolInput?: Record<string, unknown>): boolean {
  if (!toolInput) return true;
  const m = toolInput.merge;
  if (m === false || m === 0 || m === "false" || m === "0") return false;
  return true;
}

/**
 * Extract todo patch from tool input.
 * Empty content means "content omitted" (merge keeps prior text — Grok semantics).
 */
export function extractTodosFromToolInput(toolInput?: Record<string, unknown>): TodoItem[] {
  if (!toolInput) return [];
  const todos = toolInput.todos ?? toolInput.items ?? toolInput.todo;
  if (!Array.isArray(todos)) return [];
  return todos.map((t, i) => {
    if (typeof t === "string") return { id: String(i), content: t, status: "pending" };
    if (t && typeof t === "object") {
      const o = t as Record<string, unknown>;
      const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : String(i);
      const rawContent = o.content ?? o.text ?? o.title;
      const content =
        typeof rawContent === "string" && rawContent.trim().length > 0
          ? rawContent
          : "";
      const hasStatus = o.status !== undefined && o.status !== null && String(o.status) !== "";
      return {
        id,
        content,
        status: hasStatus ? String(o.status) : "",
      };
    }
    return { id: String(i), content: String(t), status: "pending" };
  });
}

/**
 * Apply todo_write to session mirror (v1.1.9).
 * merge=true: by-id update; omit content/status → keep previous (Grok default).
 * merge=false: replace list; empty content falls back to id.
 */
export function applyTodoUpdates(
  input: HookInput,
  cfg: EnvConfig,
  updates: TodoItem[],
  merge: boolean,
): TodoItem[] {
  if (!updates.length) return loadTodosMirror(input, cfg);

  if (!merge) {
    const replaced = updates.map((u, i) => {
      const id = (u.id && String(u.id).trim()) || String(i);
      return {
        id,
        content: u.content?.trim() ? u.content : id,
        status: u.status?.trim() ? u.status : "pending",
      };
    });
    mirrorTodos(input, cfg, replaced);
    return replaced;
  }

  const existing = loadTodosMirror(input, cfg);
  const order: string[] = [];
  const byId = new Map<string, TodoItem>();
  for (const t of existing) {
    const id = (t.id && String(t.id).trim()) || t.content;
    if (!byId.has(id)) order.push(id);
    byId.set(id, { ...t, id });
  }

  for (const u of updates) {
    const id = (u.id && String(u.id).trim()) || u.content || `todo-${order.length}`;
    const prev = byId.get(id);
    if (prev) {
      byId.set(id, {
        id,
        content: u.content?.trim() ? u.content : prev.content,
        status: u.status?.trim() ? u.status : prev.status || "pending",
      });
    } else {
      order.push(id);
      byId.set(id, {
        id,
        content: u.content?.trim() ? u.content : id,
        status: u.status?.trim() ? u.status : "pending",
      });
    }
  }

  const merged = order.map((id) => byId.get(id)!).filter(Boolean);
  mirrorTodos(input, cfg, merged);
  return merged;
}

/**
 * Statuses that do NOT need continuation (omo #1775: blocked/waiting must not loop).
 * pending / in_progress / empty / unknown remain open.
 */
const CLOSED_TODO_STATUSES = new Set([
  "completed",
  "done",
  "cancelled",
  "canceled",
  "blocked",
  "deferred",
  "waiting",
  "on_hold",
  "onhold",
  "hold",
  "paused",
  "wontfix",
  "wont_fix",
]);

export function isTodoOpenStatus(status?: string): boolean {
  const s = (status || "").toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (!s) return true;
  return !CLOSED_TODO_STATUSES.has(s);
}

export function incompleteTodos(input: HookInput, cfg: EnvConfig): TodoItem[] {
  return loadTodosMirror(input, cfg).filter((t) => isTodoOpenStatus(t.status));
}

export interface TodoCompleteSignalState {
  schemaVersion: 1;
  /** One-shot ALL_TODOS_COMPLETE Stop yank already fired for this completion wave. */
  signaled: boolean;
  updatedAt: string;
}

function todoCompleteSignalPath(input: HookInput, cfg: EnvConfig): string {
  return path.join(
    pathsFor(input.workspaceRoot, input.sessionId, cfg).session,
    "todo-complete-signal.json",
  );
}

export function loadTodoCompleteSignal(
  input: HookInput,
  cfg: EnvConfig,
): TodoCompleteSignalState {
  return readJson<TodoCompleteSignalState>(todoCompleteSignalPath(input, cfg), {
    schemaVersion: 1,
    signaled: false,
    updatedAt: "",
  });
}

export function markTodoCompleteSignaled(
  input: HookInput,
  cfg: EnvConfig,
  signaled: boolean,
): void {
  ensureDir(pathsFor(input.workspaceRoot, input.sessionId, cfg).session);
  writeJsonAtomic(todoCompleteSignalPath(input, cfg), {
    schemaVersion: 1,
    signaled,
    updatedAt: new Date().toISOString(),
  } satisfies TodoCompleteSignalState);
}

/**
 * omo #4111: when all mirrored todos are closed, idle Stop used to go silent.
 * One-shot block asks for a user-facing summary (not ultrawork spam).
 * Substantial non-idle replies already count as the signal.
 */
export function allTodosCompleteStopReason(
  input: HookInput,
  cfg: EnvConfig,
  opts: { idle: boolean; message?: string },
): string | null {
  const mirror = loadTodosMirror(input, cfg);
  if (!mirror.length) return null;
  const open = mirror.filter((t) => isTodoOpenStatus(t.status));
  if (open.length > 0) {
    // New work appeared — allow a future completion wave
    if (loadTodoCompleteSignal(input, cfg).signaled) {
      markTodoCompleteSignaled(input, cfg, false);
    }
    return null;
  }
  if (loadTodoCompleteSignal(input, cfg).signaled) return null;

  const msg = (opts.message || "").trim();
  // Agent already delivered a non-idle wrap-up — mark and let Stop pass
  if (!opts.idle && msg.length >= 40) {
    markTodoCompleteSignaled(input, cfg, true);
    return null;
  }

  markTodoCompleteSignaled(input, cfg, true);
  const n = mirror.length;
  const blocked = mirror.filter((t) =>
    /^(blocked|deferred|waiting|on_hold|onhold|hold|paused)$/i.test(
      (t.status || "").trim().replace(/[\s-]+/g, "_"),
    ),
  ).length;
  return [
    "ALL_TODOS_COMPLETE — no open todos remain (omo #4111).",
    `Closed items in mirror: ${n}${blocked ? ` (incl. ${blocked} blocked/deferred)` : ""}.`,
    "",
    "Give the user a brief completion summary (what shipped / verified).",
    "Do not invent new todos unless the user asks. Do not go silent.",
  ].join("\n");
}

export function loadBoulder(input: HookInput, cfg: EnvConfig): BoulderState | null {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  const b = readJson<BoulderState | null>(p.boulder, null);
  if (!b?.active) return null;
  return b;
}

export function setBoulder(input: HookInput, cfg: EnvConfig, state: BoulderState): void {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  writeJsonAtomic(p.boulder, { ...state, updatedAt: new Date().toISOString() });
}

export function clearBoulder(input: HookInput, cfg: EnvConfig): void {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  removeFile(p.boulder);
}

export function isStopPaused(input: HookInput, cfg: EnvConfig): boolean {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  const s = readJson<StopPauseState>(p.stopContinuation, { paused: false, updatedAt: "" });
  return Boolean(s.paused);
}

export function setStopPaused(input: HookInput, cfg: EnvConfig, paused: boolean): void {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  writeJsonAtomic(p.stopContinuation, {
    paused,
    updatedAt: new Date().toISOString(),
  } satisfies StopPauseState);
}

/** Abort-like stop reasons re-open yank within todoAbortWindowMs (omo-style). */
export function isAbortLikeStopReason(stopReason?: string): boolean {
  if (!stopReason) return false;
  const s = stopReason.toLowerCase().trim();
  // Normal completion must not re-open yank
  if (s === "end_turn" || s === "stop" || s === "completed" || s === "done") {
    return false;
  }
  return (
    /\b(abort(ed)?|interrupt(ed)?|tool[_-]?error|timeout|max_tokens?|rate[_-]?limit|failed)\b/.test(
      s,
    ) || /\bcancel(led|ed)?\b/.test(s)
  );
}

export function todoEnforcerAllows(
  input: HookInput,
  cfg: EnvConfig,
  now = Date.now(),
): { allow: boolean; reason?: string } {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  const st = readJson<TodoEnforcerState>(p.todoEnforcer, {
    schemaVersion: 2,
    lastContinueAt: 0,
    consecutiveContinues: 0,
    stagnationCount: 0,
  });
  const since = st.lastContinueAt ? now - st.lastContinueAt : Number.POSITIVE_INFINITY;
  const maxContinues = cfg.todoMaxContinues > 0 ? cfg.todoMaxContinues : 20;
  const maxStag = cfg.todoMaxStagnation > 0 ? cfg.todoMaxStagnation : 3;

  // Circuit open: stop nagging (omo MAX_STAGNATION / max continues)
  if ((st.stagnationCount || 0) >= maxStag) {
    return { allow: false, reason: "todo-enforcer-stagnation" };
  }
  if (st.consecutiveContinues >= maxContinues) {
    return { allow: false, reason: "todo-enforcer-max" };
  }

  // Abort window: if agent aborted/errored soon after a continue, re-yank despite cooldown
  if (
    isAbortLikeStopReason(input.stopReason) &&
    st.lastContinueAt > 0 &&
    since < cfg.todoAbortWindowMs
  ) {
    return { allow: true, reason: "todo-enforcer-abort-window" };
  }

  if (st.lastContinueAt && since < cfg.todoCooldownMs) {
    return { allow: false, reason: "todo-enforcer-cooldown" };
  }
  return { allow: true };
}

/** Circuit open = do not re-yank (stagnation or max continues). */
export function isTodoEnforcerCircuitOpen(reason?: string): boolean {
  return (
    reason === "todo-enforcer-stagnation" || reason === "todo-enforcer-max"
  );
}

/** v1.1.65: snapshot for SessionResume / diagnostics (omo circuit visibility). */
export function todoEnforcerCircuitStatus(
  input: HookInput,
  cfg: EnvConfig,
): {
  open: boolean;
  reason?: "stagnation" | "max";
  stagnationCount: number;
  consecutiveContinues: number;
} {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  const st = readJson<TodoEnforcerState>(p.todoEnforcer, {
    schemaVersion: 2,
    lastContinueAt: 0,
    consecutiveContinues: 0,
    stagnationCount: 0,
  });
  const maxContinues = cfg.todoMaxContinues > 0 ? cfg.todoMaxContinues : 20;
  const maxStag = cfg.todoMaxStagnation > 0 ? cfg.todoMaxStagnation : 3;
  const stag = st.stagnationCount || 0;
  const cont = st.consecutiveContinues || 0;
  if (stag >= maxStag) {
    return {
      open: true,
      reason: "stagnation",
      stagnationCount: stag,
      consecutiveContinues: cont,
    };
  }
  if (cont >= maxContinues) {
    return {
      open: true,
      reason: "max",
      stagnationCount: stag,
      consecutiveContinues: cont,
    };
  }
  return {
    open: false,
    stagnationCount: stag,
    consecutiveContinues: cont,
  };
}

export function markTodoContinued(
  input: HookInput,
  cfg: EnvConfig,
  now = Date.now(),
  openTodos?: TodoItem[],
): void {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  const st = readJson<TodoEnforcerState>(p.todoEnforcer, {
    schemaVersion: 2,
    lastContinueAt: 0,
    consecutiveContinues: 0,
    stagnationCount: 0,
  });
  const open = openTodos ?? incompleteTodos(input, cfg);
  const fp = fingerprintOpenTodos(open);
  // Count consecutive yanks with unchanged open set (omo MAX_STAGNATION_COUNT)
  if (open.length === 0) {
    st.stagnationCount = 0;
    st.lastOpenFingerprint = "";
  } else if (st.lastOpenFingerprint === fp) {
    st.stagnationCount = (st.stagnationCount || 0) + 1;
  } else {
    st.stagnationCount = 1;
  }
  st.lastOpenFingerprint = open.length ? fp : "";
  st.lastContinueAt = now;
  st.consecutiveContinues += 1;
  st.schemaVersion = 2;
  writeJsonAtomic(p.todoEnforcer, st);
}

export function resetTodoEnforcer(input: HookInput, cfg: EnvConfig): void {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  writeJsonAtomic(p.todoEnforcer, {
    schemaVersion: 2,
    lastContinueAt: 0,
    consecutiveContinues: 0,
    stagnationCount: 0,
    lastOpenFingerprint: "",
  } satisfies TodoEnforcerState);
}

export function boulderStopReason(b: BoulderState): string {
  return [
    "BOULDER CONTINUATION — plan work not finished.",
    b.title ? `Title: ${b.title}` : "",
    b.planPath ? `Plan: ${b.planPath}` : "",
    b.notes || "",
    "Continue executing the active plan. Update todos. Do not idle.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function todoStopReason(todos: TodoItem[]): string {
  const list = todos
    .slice(0, 12)
    .map((t) => `- [${t.status}] ${t.content}`)
    .join("\n");
  return [
    "TODO CONTINUATION — incomplete todos remain.",
    list,
    todos.length > 12 ? `… +${todos.length - 12} more` : "",
    "Continue working the next incomplete todo. Mark done via TodoWrite when finished.",
  ]
    .filter(Boolean)
    .join("\n");
}

export interface PlanTaskCheckbox {
  label: string;
  checked: boolean;
}

/**
 * Parse labeled GFM task checkboxes outside ## Review (omo #6094 / #6066).
 * Empty placeholders (`- [ ]` with no label) are ignored — they are not work.
 * ## Review is start-work gate only; open Metis boxes must not pin boulder forever.
 */
export function parsePlanTaskCheckboxes(text: string): PlanTaskCheckbox[] {
  if (!text) return [];
  const out: PlanTaskCheckbox[] = [];
  let inReview = false;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    const hm = t.match(/^#{1,6}\s+(.+)$/);
    if (hm) {
      inReview = /^review\b/i.test(hm[1].trim());
      continue;
    }
    if (inReview) continue;
    // Indented or top-level: - [ ] label / * [x] label
    const m = t.match(/^[-*+]\s*\[([ xX])\]\s+(\S.*)$/);
    if (!m) continue;
    const label = m[2].trim();
    if (!label) continue;
    out.push({ label, checked: /x/i.test(m[1]) });
  }
  return out;
}

/** Seed session todos from plan task rows (open → pending, checked → completed). */
export function planTasksToTodos(tasks: PlanTaskCheckbox[]): TodoItem[] {
  return tasks.map((t, i) => ({
    id: `plan-${i + 1}`,
    content: t.label,
    status: t.checked ? "completed" : "pending",
  }));
}

/**
 * If todo mirror is empty, seed from plan task checkboxes (omo #6066 Goal parity).
 * Does not overwrite an existing non-empty todo list.
 */
export function seedTodosFromPlanIfEmpty(
  input: HookInput,
  cfg: EnvConfig,
  planPath: string,
): TodoItem[] {
  const existing = loadTodosMirror(input, cfg);
  if (existing.length > 0) return existing;
  if (!planPath || !fs.existsSync(planPath)) return [];
  const text = readText(planPath);
  if (!text) return [];
  const todos = planTasksToTodos(parsePlanTaskCheckboxes(text));
  if (!todos.length) return [];
  mirrorTodos(input, cfg, todos);
  return todos;
}

/**
 * True when path is a plan markdown we should sync (boulder / .omg/plans / root plan.md).
 * v1.1.29: use canonical containment — reject `../.omg/plans` / foreign `.../.omg/plans/` substrings.
 */
export function isPlanMarkdownPath(
  filePath: string,
  input: HookInput,
  cfg: EnvConfig,
): boolean {
  if (!filePath?.trim()) return false;
  const baseDir = input.workspaceRoot || input.cwd || ".";
  const target = canonicalizeTargetPath(baseDir, filePath);
  if (!target) return false;
  if (!/\.md$/i.test(target)) return false;

  const plansDir = pathsFor(baseDir, input.sessionId, cfg).plansDir;
  if (
    isTargetInside({
      boundary: plansDir,
      baseDir,
      target: filePath,
    })
  ) {
    return true;
  }

  // Workspace-root plan.md / PLAN.md (exact file boundary)
  for (const name of ["plan.md", "PLAN.md"]) {
    if (
      isTargetInside({
        boundary: path.join(baseDir, name),
        baseDir,
        target: filePath,
      })
    ) {
      return true;
    }
  }

  const boulder = loadBoulder(input, cfg);
  if (boulder?.planPath?.trim()) {
    const bp = canonicalizeTargetPath(baseDir, boulder.planPath);
    if (bp && bp.toLowerCase() === target.toLowerCase()) return true;
  }
  return false;
}

/**
 * Align todo mirror with plan checkbox progress (v1.1.20).
 * After start-work seed, agents often only flip `- [ ]` → `- [x]` in the plan
 * and never call todo_write — Stop then yanks forever on stale pending todos.
 * Match by exact label or plan-N id order.
 * @returns number of todos whose status changed
 */
export function syncTodosFromPlanCheckboxes(
  input: HookInput,
  cfg: EnvConfig,
  planPath?: string,
): number {
  const boulder = loadBoulder(input, cfg);
  const target =
    planPath ||
    boulder?.planPath ||
    "";
  if (!target || !fs.existsSync(target)) return 0;
  const text = readText(target);
  if (!text) return 0;
  const tasks = parsePlanTaskCheckboxes(text);
  if (!tasks.length) return 0;

  const existing = loadTodosMirror(input, cfg);
  if (!existing.length) return 0;

  const byLabel = new Map(tasks.map((t) => [t.label, t]));
  let changed = 0;
  const next = existing.map((todo) => {
    let task: PlanTaskCheckbox | undefined;
    // plan-N ids from seedTodosFromPlanIfEmpty
    const planIdx = /^plan-(\d+)$/i.exec(todo.id || "");
    if (planIdx) {
      const idx = Number(planIdx[1]) - 1;
      task = tasks[idx];
    }
    if (!task) task = byLabel.get(todo.content);
    if (!task) return todo;
    // Only promote open → completed when plan row is checked; do not reopen completed
    if (task.checked && isTodoOpenStatus(todo.status)) {
      changed += 1;
      return { ...todo, content: todo.content || task.label, status: "completed" };
    }
    // Keep content in sync if empty
    if (!todo.content?.trim() && task.label) {
      changed += 1;
      return {
        ...todo,
        content: task.label,
        status: todo.status || (task.checked ? "completed" : "pending"),
      };
    }
    return todo;
  });

  if (changed > 0) {
    mirrorTodos(input, cfg, next);
    if (incompleteTodos(input, cfg).length === 0) {
      resetTodoEnforcer(input, cfg);
    }
  }
  return changed;
}

export function hasOpenPlanCheckboxes(input: HookInput, cfg: EnvConfig): string | null {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  const files: string[] = [];
  // Prefer active boulder plan path (may be the only open checklist that matters)
  const boulder = loadBoulder(input, cfg);
  if (boulder?.planPath && fs.existsSync(boulder.planPath)) {
    files.push(boulder.planPath);
  }
  for (const name of ["plan.md", "PLAN.md"]) {
    const f = path.join(input.workspaceRoot, name);
    if (fs.existsSync(f)) files.push(f);
  }
  if (fs.existsSync(p.plansDir)) {
    for (const f of fs.readdirSync(p.plansDir)) {
      if (f.endsWith(".md")) files.push(path.join(p.plansDir, f));
    }
  }
  const seen = new Set<string>();
  for (const f of files) {
    const key = path.resolve(f).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const text = readText(f);
    if (!text) continue;
    // v1.1.18: labeled open only; skip ## Review + empty `- [ ]` placeholders
    const open = parsePlanTaskCheckboxes(text).filter((t) => !t.checked);
    if (open.length > 0) {
      const sample = open
        .slice(0, 4)
        .map((t) => t.label)
        .join("; ");
      return `PLAN CHECKBOXES open in ${f} (${open.length}): ${sample}. Continue until all [ ] are [x] or cancelled.`;
    }
  }
  return null;
}
