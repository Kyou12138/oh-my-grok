import fs from "node:fs";
import path from "node:path";
import type { EnvConfig, HookInput } from "../protocol/types.js";
import { ensureDir, readJson, readText, removeFile, writeJsonAtomic } from "../state/fs.js";
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
  schemaVersion: 1;
  lastContinueAt: number;
  consecutiveContinues: number;
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

export function extractTodosFromToolInput(toolInput?: Record<string, unknown>): TodoItem[] {
  if (!toolInput) return [];
  const todos = toolInput.todos ?? toolInput.items ?? toolInput.todo;
  if (!Array.isArray(todos)) return [];
  return todos.map((t, i) => {
    if (typeof t === "string") return { content: t, status: "pending" };
    if (t && typeof t === "object") {
      const o = t as Record<string, unknown>;
      return {
        id: typeof o.id === "string" ? o.id : String(i),
        content: String(o.content ?? o.text ?? o.title ?? `todo-${i}`),
        status: String(o.status ?? "pending"),
      };
    }
    return { content: String(t), status: "pending" };
  });
}

export function incompleteTodos(input: HookInput, cfg: EnvConfig): TodoItem[] {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  const mirror = readJson<TodoMirror | null>(p.todosFile, null);
  if (!mirror?.todos?.length) return [];
  return mirror.todos.filter((t) => {
    const s = (t.status || "").toLowerCase();
    return s !== "completed" && s !== "done" && s !== "cancelled" && s !== "canceled";
  });
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
  const s = stopReason.toLowerCase();
  return /abort|error|interrupt|tool_error|tool-error|timeout|max_token|rate.?limit|failed|cancel/.test(
    s,
  );
}

export function todoEnforcerAllows(
  input: HookInput,
  cfg: EnvConfig,
  now = Date.now(),
): { allow: boolean; reason?: string } {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  const st = readJson<TodoEnforcerState>(p.todoEnforcer, {
    schemaVersion: 1,
    lastContinueAt: 0,
    consecutiveContinues: 0,
  });
  const since = st.lastContinueAt ? now - st.lastContinueAt : Number.POSITIVE_INFINITY;

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
  if (st.consecutiveContinues >= 20) {
    return { allow: false, reason: "todo-enforcer-max" };
  }
  return { allow: true };
}

export function markTodoContinued(input: HookInput, cfg: EnvConfig, now = Date.now()): void {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  const st = readJson<TodoEnforcerState>(p.todoEnforcer, {
    schemaVersion: 1,
    lastContinueAt: 0,
    consecutiveContinues: 0,
  });
  st.lastContinueAt = now;
  st.consecutiveContinues += 1;
  writeJsonAtomic(p.todoEnforcer, st);
}

export function resetTodoEnforcer(input: HookInput, cfg: EnvConfig): void {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  writeJsonAtomic(p.todoEnforcer, {
    schemaVersion: 1,
    lastContinueAt: 0,
    consecutiveContinues: 0,
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

export function hasOpenPlanCheckboxes(input: HookInput, cfg: EnvConfig): string | null {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  const files: string[] = [];
  for (const name of ["plan.md", "PLAN.md"]) {
    const f = path.join(input.workspaceRoot, name);
    if (fs.existsSync(f)) files.push(f);
  }
  if (fs.existsSync(p.plansDir)) {
    for (const f of fs.readdirSync(p.plansDir)) {
      if (f.endsWith(".md")) files.push(path.join(p.plansDir, f));
    }
  }
  for (const f of files) {
    const text = readText(f);
    if (text && /^- \[ \]/m.test(text)) {
      return `PLAN CHECKBOXES open in ${f}. Continue until all [ ] are [x] or cancelled.`;
    }
  }
  return null;
}
