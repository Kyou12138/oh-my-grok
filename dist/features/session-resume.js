import { findLatestHandoff } from "./handoff.js";
import { loadRalph } from "./ralph.js";
import { incompleteTodos, loadBoulder } from "./todo-boulder.js";
export function sessionResumeSummary(input, cfg) {
    const lines = [];
    const ralph = loadRalph(input, cfg);
    if (ralph?.active) {
        const open = (ralph.goals || []).filter((g) => !g.done);
        const goalBit = open.length > 0
            ? ` openGoals=${open.length}/${ralph.goals?.length || 0}`
            : ralph.goals?.length
                ? " all goals marked done"
                : "";
        lines.push(`- **${ralph.mode.toUpperCase()}** active: ${ralph.task.slice(0, 120)}${ralph.task.length > 120 ? "…" : ""}`, `  iter ${ralph.iteration}/${ralph.maxIterations} phase=${ralph.phase}${goalBit}`);
    }
    const boulder = loadBoulder(input, cfg);
    if (boulder?.active) {
        lines.push(`- **Boulder** active: ${boulder.title || "untitled"}`, boulder.planPath ? `  plan: ${boulder.planPath}` : "");
    }
    const todos = incompleteTodos(input, cfg);
    if (todos.length > 0) {
        const preview = todos
            .slice(0, 4)
            .map((t) => t.content || t.title || "?")
            .join("; ");
        lines.push(`- **Todos** incomplete: ${todos.length} — ${preview}${todos.length > 4 ? "…" : ""}`);
    }
    const handoff = findLatestHandoff(input.workspaceRoot, cfg, input.sessionId);
    if (handoff) {
        lines.push(`- **Handoff** on disk: ${handoff} (see OMG_HANDOFF_RESUME if injected)`);
    }
    const body = lines.filter(Boolean);
    if (!body.length)
        return "";
    return [
        "<OMG_SESSION_RESUME>",
        "Workspace state from previous turns / sessions (oh-my-grok):",
        ...body,
        "Continue unfinished work; do not re-plan from zero if a loop/boulder is already active.",
        "</OMG_SESSION_RESUME>",
    ].join("\n");
}
//# sourceMappingURL=session-resume.js.map