import fs from "node:fs";
import path from "node:path";
import { ensureDir, readJson, readText, removeFile, writeJsonAtomic } from "../state/fs.js";
import { pathsFor } from "../state/paths.js";
export function fingerprintOpenTodos(todos) {
    return todos
        .map((t) => `${t.id || ""}|${(t.status || "").toLowerCase()}|${t.content || ""}`)
        .sort()
        .join("\n");
}
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
export function loadTodosMirror(input, cfg) {
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    const mirror = readJson(p.todosFile, null);
    return mirror?.todos?.length ? mirror.todos : [];
}
/**
 * Grok todo_write defaults merge=true (partial updates by id).
 * Explicit false → full replace.
 */
export function isTodoMergeMode(toolInput) {
    if (!toolInput)
        return true;
    const m = toolInput.merge;
    if (m === false || m === 0 || m === "false" || m === "0")
        return false;
    return true;
}
/**
 * Extract todo patch from tool input.
 * Empty content means "content omitted" (merge keeps prior text — Grok semantics).
 */
export function extractTodosFromToolInput(toolInput) {
    if (!toolInput)
        return [];
    const todos = toolInput.todos ?? toolInput.items ?? toolInput.todo;
    if (!Array.isArray(todos))
        return [];
    return todos.map((t, i) => {
        if (typeof t === "string")
            return { id: String(i), content: t, status: "pending" };
        if (t && typeof t === "object") {
            const o = t;
            const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : String(i);
            const rawContent = o.content ?? o.text ?? o.title;
            const content = typeof rawContent === "string" && rawContent.trim().length > 0
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
export function applyTodoUpdates(input, cfg, updates, merge) {
    if (!updates.length)
        return loadTodosMirror(input, cfg);
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
    const order = [];
    const byId = new Map();
    for (const t of existing) {
        const id = (t.id && String(t.id).trim()) || t.content;
        if (!byId.has(id))
            order.push(id);
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
        }
        else {
            order.push(id);
            byId.set(id, {
                id,
                content: u.content?.trim() ? u.content : id,
                status: u.status?.trim() ? u.status : "pending",
            });
        }
    }
    const merged = order.map((id) => byId.get(id)).filter(Boolean);
    mirrorTodos(input, cfg, merged);
    return merged;
}
export function isTodoOpenStatus(status) {
    const s = (status || "").toLowerCase();
    return s !== "completed" && s !== "done" && s !== "cancelled" && s !== "canceled";
}
export function incompleteTodos(input, cfg) {
    return loadTodosMirror(input, cfg).filter((t) => isTodoOpenStatus(t.status));
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
    const s = stopReason.toLowerCase().trim();
    // Normal completion must not re-open yank
    if (s === "end_turn" || s === "stop" || s === "completed" || s === "done") {
        return false;
    }
    return (/\b(abort(ed)?|interrupt(ed)?|tool[_-]?error|timeout|max_tokens?|rate[_-]?limit|failed)\b/.test(s) || /\bcancel(led|ed)?\b/.test(s));
}
export function todoEnforcerAllows(input, cfg, now = Date.now()) {
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    const st = readJson(p.todoEnforcer, {
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
    if (isAbortLikeStopReason(input.stopReason) &&
        st.lastContinueAt > 0 &&
        since < cfg.todoAbortWindowMs) {
        return { allow: true, reason: "todo-enforcer-abort-window" };
    }
    if (st.lastContinueAt && since < cfg.todoCooldownMs) {
        return { allow: false, reason: "todo-enforcer-cooldown" };
    }
    return { allow: true };
}
/** Circuit open = do not re-yank (stagnation or max continues). */
export function isTodoEnforcerCircuitOpen(reason) {
    return (reason === "todo-enforcer-stagnation" || reason === "todo-enforcer-max");
}
export function markTodoContinued(input, cfg, now = Date.now(), openTodos) {
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    const st = readJson(p.todoEnforcer, {
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
    }
    else if (st.lastOpenFingerprint === fp) {
        st.stagnationCount = (st.stagnationCount || 0) + 1;
    }
    else {
        st.stagnationCount = 1;
    }
    st.lastOpenFingerprint = open.length ? fp : "";
    st.lastContinueAt = now;
    st.consecutiveContinues += 1;
    st.schemaVersion = 2;
    writeJsonAtomic(p.todoEnforcer, st);
}
export function resetTodoEnforcer(input, cfg) {
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    writeJsonAtomic(p.todoEnforcer, {
        schemaVersion: 2,
        lastContinueAt: 0,
        consecutiveContinues: 0,
        stagnationCount: 0,
        lastOpenFingerprint: "",
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
    // Prefer active boulder plan path (may be the only open checklist that matters)
    const boulder = loadBoulder(input, cfg);
    if (boulder?.planPath && fs.existsSync(boulder.planPath)) {
        files.push(boulder.planPath);
    }
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
    const seen = new Set();
    for (const f of files) {
        const key = path.resolve(f).toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        const text = readText(f);
        // Open boxes: "- [ ]", "* [ ]", indented, optional extra spaces inside brackets
        if (text && /^\s*[-*+]\s*\[\s\]/m.test(text)) {
            return `PLAN CHECKBOXES open in ${f}. Continue until all [ ] are [x] or cancelled.`;
        }
    }
    return null;
}
//# sourceMappingURL=todo-boulder.js.map