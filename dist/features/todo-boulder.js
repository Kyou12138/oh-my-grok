import fs from "node:fs";
import path from "node:path";
import { ensureDir, readJson, readText, removeFile, writeJsonAtomic } from "../state/fs.js";
import { pathsFor } from "../state/paths.js";
export function mirrorTodos(input, cfg, todos) {
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    ensureDir(p.todosDir);
    writeJsonAtomic(p.todosFile, {
        schemaVersion: 1,
        sessionId: input.sessionId,
        todos,
        updatedAt: new Date().toISOString(),
    });
}
export function extractTodosFromToolInput(toolInput) {
    if (!toolInput)
        return [];
    const todos = toolInput.todos ?? toolInput.items ?? toolInput.todo;
    if (!Array.isArray(todos))
        return [];
    return todos.map((t, i) => {
        if (typeof t === "string")
            return { content: t, status: "pending" };
        if (t && typeof t === "object") {
            const o = t;
            return {
                id: typeof o.id === "string" ? o.id : String(i),
                content: String(o.content ?? o.text ?? o.title ?? `todo-${i}`),
                status: String(o.status ?? "pending"),
            };
        }
        return { content: String(t), status: "pending" };
    });
}
export function incompleteTodos(input, cfg) {
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    const mirror = readJson(p.todosFile, null);
    if (!mirror?.todos?.length)
        return [];
    return mirror.todos.filter((t) => {
        const s = (t.status || "").toLowerCase();
        return s !== "completed" && s !== "done" && s !== "cancelled" && s !== "canceled";
    });
}
export function loadBoulder(input, cfg) {
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    const b = readJson(p.boulder, null);
    if (!b?.active)
        return null;
    return b;
}
export function setBoulder(input, cfg, state) {
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    writeJsonAtomic(p.boulder, { ...state, updatedAt: new Date().toISOString() });
}
export function clearBoulder(input, cfg) {
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    removeFile(p.boulder);
}
export function isStopPaused(input, cfg) {
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    const s = readJson(p.stopContinuation, { paused: false, updatedAt: "" });
    return Boolean(s.paused);
}
export function setStopPaused(input, cfg, paused) {
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    writeJsonAtomic(p.stopContinuation, {
        paused,
        updatedAt: new Date().toISOString(),
    });
}
/** Abort-like stop reasons re-open yank within todoAbortWindowMs (omo-style). */
export function isAbortLikeStopReason(stopReason) {
    if (!stopReason)
        return false;
    const s = stopReason.toLowerCase();
    return /abort|error|interrupt|tool_error|tool-error|timeout|max_token|rate.?limit|failed|cancel/.test(s);
}
export function todoEnforcerAllows(input, cfg, now = Date.now()) {
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    const st = readJson(p.todoEnforcer, {
        schemaVersion: 1,
        lastContinueAt: 0,
        consecutiveContinues: 0,
    });
    const since = st.lastContinueAt ? now - st.lastContinueAt : Number.POSITIVE_INFINITY;
    // Abort window: if agent aborted/errored soon after a continue, re-yank despite cooldown
    if (isAbortLikeStopReason(input.stopReason) &&
        st.lastContinueAt > 0 &&
        since < cfg.todoAbortWindowMs) {
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
export function markTodoContinued(input, cfg, now = Date.now()) {
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    const st = readJson(p.todoEnforcer, {
        schemaVersion: 1,
        lastContinueAt: 0,
        consecutiveContinues: 0,
    });
    st.lastContinueAt = now;
    st.consecutiveContinues += 1;
    writeJsonAtomic(p.todoEnforcer, st);
}
export function resetTodoEnforcer(input, cfg) {
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    writeJsonAtomic(p.todoEnforcer, {
        schemaVersion: 1,
        lastContinueAt: 0,
        consecutiveContinues: 0,
    });
}
export function boulderStopReason(b) {
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
export function todoStopReason(todos) {
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
export function hasOpenPlanCheckboxes(input, cfg) {
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    const files = [];
    for (const name of ["plan.md", "PLAN.md"]) {
        const f = path.join(input.workspaceRoot, name);
        if (fs.existsSync(f))
            files.push(f);
    }
    if (fs.existsSync(p.plansDir)) {
        for (const f of fs.readdirSync(p.plansDir)) {
            if (f.endsWith(".md"))
                files.push(path.join(p.plansDir, f));
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
//# sourceMappingURL=todo-boulder.js.map