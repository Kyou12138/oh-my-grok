import type { EnvConfig, HookInput } from "../protocol/types.js";
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
export declare function fingerprintOpenTodos(todos: TodoItem[]): string;
export interface StopPauseState {
    paused: boolean;
    updatedAt: string;
}
export declare function mirrorTodos(input: HookInput, cfg: EnvConfig, todos: TodoItem[]): void;
export declare function loadTodosMirror(input: HookInput, cfg: EnvConfig): TodoItem[];
/**
 * Grok todo_write defaults merge=true (partial updates by id).
 * Explicit false → full replace.
 */
export declare function isTodoMergeMode(toolInput?: Record<string, unknown>): boolean;
/**
 * Extract todo patch from tool input.
 * Empty content means "content omitted" (merge keeps prior text — Grok semantics).
 */
export declare function extractTodosFromToolInput(toolInput?: Record<string, unknown>): TodoItem[];
/**
 * Apply todo_write to session mirror (v1.1.9).
 * merge=true: by-id update; omit content/status → keep previous (Grok default).
 * merge=false: replace list; empty content falls back to id.
 */
export declare function applyTodoUpdates(input: HookInput, cfg: EnvConfig, updates: TodoItem[], merge: boolean): TodoItem[];
export declare function isTodoOpenStatus(status?: string): boolean;
export declare function incompleteTodos(input: HookInput, cfg: EnvConfig): TodoItem[];
export interface TodoCompleteSignalState {
    schemaVersion: 1;
    /** One-shot ALL_TODOS_COMPLETE Stop yank already fired for this completion wave. */
    signaled: boolean;
    updatedAt: string;
}
export declare function loadTodoCompleteSignal(input: HookInput, cfg: EnvConfig): TodoCompleteSignalState;
export declare function markTodoCompleteSignaled(input: HookInput, cfg: EnvConfig, signaled: boolean): void;
/**
 * omo #4111: when all mirrored todos are closed, idle Stop used to go silent.
 * One-shot block asks for a user-facing summary (not ultrawork spam).
 * Substantial non-idle replies already count as the signal.
 */
export declare function allTodosCompleteStopReason(input: HookInput, cfg: EnvConfig, opts: {
    idle: boolean;
    message?: string;
}): string | null;
export declare function loadBoulder(input: HookInput, cfg: EnvConfig): BoulderState | null;
export declare function setBoulder(input: HookInput, cfg: EnvConfig, state: BoulderState): void;
export declare function clearBoulder(input: HookInput, cfg: EnvConfig): void;
export declare function isStopPaused(input: HookInput, cfg: EnvConfig): boolean;
export declare function setStopPaused(input: HookInput, cfg: EnvConfig, paused: boolean): void;
/** Abort-like stop reasons re-open yank within todoAbortWindowMs (omo-style). */
export declare function isAbortLikeStopReason(stopReason?: string): boolean;
export declare function todoEnforcerAllows(input: HookInput, cfg: EnvConfig, now?: number): {
    allow: boolean;
    reason?: string;
};
/** Circuit open = do not re-yank (stagnation or max continues). */
export declare function isTodoEnforcerCircuitOpen(reason?: string): boolean;
export declare function markTodoContinued(input: HookInput, cfg: EnvConfig, now?: number, openTodos?: TodoItem[]): void;
export declare function resetTodoEnforcer(input: HookInput, cfg: EnvConfig): void;
export declare function boulderStopReason(b: BoulderState): string;
export declare function todoStopReason(todos: TodoItem[]): string;
export interface PlanTaskCheckbox {
    label: string;
    checked: boolean;
}
/**
 * Parse labeled GFM task checkboxes outside ## Review (omo #6094 / #6066).
 * Empty placeholders (`- [ ]` with no label) are ignored — they are not work.
 * ## Review is start-work gate only; open Metis boxes must not pin boulder forever.
 */
export declare function parsePlanTaskCheckboxes(text: string): PlanTaskCheckbox[];
/** Seed session todos from plan task rows (open → pending, checked → completed). */
export declare function planTasksToTodos(tasks: PlanTaskCheckbox[]): TodoItem[];
/**
 * If todo mirror is empty, seed from plan task checkboxes (omo #6066 Goal parity).
 * Does not overwrite an existing non-empty todo list.
 */
export declare function seedTodosFromPlanIfEmpty(input: HookInput, cfg: EnvConfig, planPath: string): TodoItem[];
export declare function hasOpenPlanCheckboxes(input: HookInput, cfg: EnvConfig): string | null;
