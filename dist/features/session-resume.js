import { findLatestHandoff } from "./handoff.js";
import { loadRalph } from "./ralph.js";
import { getSpawnFollowThroughState } from "./spawn-followthrough.js";
import { hasOpenPlanCheckboxes, incompleteTodos, loadBoulder, todoEnforcerCircuitStatus, } from "./todo-boulder.js";
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
        if (ralph.mode === "ulw") {
            const pr = ralph.phaseReached || {
                explore: false,
                implement: false,
                verify: false,
            };
            lines.push(`  reached: explore=${pr.explore} implement=${pr.implement} verify=${pr.verify} · ceremony=${ralph.ceremonyOpened} · researchOnly=${!!ralph.researchOnly} · stall=${ralph.stallCount}`);
            if (!ralph.ceremonyOpened) {
                lines.push("  ⚠ **ceremony incomplete** — first line `ULTRAWORK MODE ENABLED!` / `ULTRAWORK 模式已启动！`; PreTool blocks writes until opener + explore Read");
            }
            else {
                lines.push("  🔔 ULW hard: ceremony + explore-before-write PreTool · DONE needs implement writes (unless researchOnly) + VERIFIED");
            }
            if (ralph.stallCount >= 3) {
                const maxS = typeof cfg.maxUlwStall === "number" && cfg.maxUlwStall >= 0
                    ? cfg.maxUlwStall
                    : 8;
                lines.push(maxS > 0
                    ? `  ⚠ stall×${ralph.stallCount} — at maxUlwStall=${maxS} loop auto-cancels (STALL CIRCUIT)`
                    : `  ⚠ stall×${ralph.stallCount} — maxUlwStall=0 (circuit off); change strategy`);
            }
            lines.push("  state: `.omg/ulw-loop/` · ceremony: `.omg/ulw-loop/CEREMONY.md`");
        }
    }
    const boulder = loadBoulder(input, cfg);
    if (boulder?.active) {
        lines.push(`- **Boulder** active: ${boulder.title || "untitled"}`, boulder.planPath ? `  plan: ${boulder.planPath}` : "");
        const openPlan = hasOpenPlanCheckboxes(input, cfg);
        if (openPlan) {
            lines.push("  ⚠ open plan checkboxes remain — finish or cancel-boulder before DONE");
        }
    }
    const todos = incompleteTodos(input, cfg);
    if (todos.length > 0) {
        const preview = todos
            .slice(0, 4)
            .map((t) => t.content || "?")
            .join("; ");
        lines.push(`- **Todos** incomplete: ${todos.length} — ${preview}${todos.length > 4 ? "…" : ""}`);
    }
    // v1.1.65: surface todo enforcer circuit (omo stagnation / max continues)
    const todoCircuit = todoEnforcerCircuitStatus(input, cfg);
    if (todoCircuit.open) {
        lines.push(`- **Todo enforcer CIRCUIT OPEN** (${todoCircuit.reason}) — stagnation=${todoCircuit.stagnationCount} continues=${todoCircuit.consecutiveContinues}`, "  Incomplete todos will **not** re-yank Stop; finish or clear todos manually (no silent freeze — this is the honest signal).");
    }
    // v1.1.65: spawn follow-through pending across sessions
    const spawn = getSpawnFollowThroughState(input, cfg);
    if (spawn.pending) {
        const roleBit = spawn.lastRole ? ` role=${spawn.lastRole}` : "";
        const fin = spawn.childFinished ? " childFinished=true" : " child still running or End missed";
        lines.push(`- **Spawn follow-through** pending${roleBit}${fin} · yanks=${spawn.yankCount}`, "  Recover with **get_task_output** / integrate findings before more mutating work (PreTool may deny once).");
    }
    const handoff = findLatestHandoff(input.workspaceRoot, cfg, input.sessionId);
    if (handoff) {
        lines.push(`- **Handoff** on disk: ${handoff} (see OMG_HANDOFF_RESUME if injected)`);
    }
    const body = lines.filter(Boolean);
    // v1.1.24: always emit resume banner (wow path) — even empty state reminds hard gates
    return [
        "<OMG_SESSION_RESUME>",
        body.length
            ? "Workspace state from previous turns / sessions (oh-my-grok):"
            : "No active ULW/boulder/todos yet — start with /plan, ultrawork, or a concrete edit.",
        ...body,
        body.length
            ? "Continue unfinished work; do not re-plan from zero if a loop/boulder is already active."
            : "PreTool will deny blind edits (Hashline) and plan-mode writes outside `.omg/plans/`.",
        "</OMG_SESSION_RESUME>",
    ].join("\n");
}
//# sourceMappingURL=session-resume.js.map