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
    schemaVersion: 1;
    lastContinueAt: number;
    consecutiveContinues: number;
}
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
export declare function markTodoContinued(input: HookInput, cfg: EnvConfig, now?: number): void;
export declare function resetTodoEnforcer(input: HookInput, cfg: EnvConfig): void;
export declare function boulderStopReason(b: BoulderState): string;
export declare function todoStopReason(todos: TodoItem[]): string;
export declare function hasOpenPlanCheckboxes(input: HookInput, cfg: EnvConfig): string | null;
