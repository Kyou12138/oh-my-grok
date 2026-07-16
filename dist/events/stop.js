import { diagStopReason, isVerifiedMessage, loadDiag, markSoftPrompted, markVerified, } from "../features/diagnostics.js";
import { commentAggregateStopReason, markCommentSoftPrompted, } from "../features/comment-checker.js";
import { idleTurnStopReason, isIdleAssistantMessage } from "../features/idle-turn.js";
import { categoryDisciplineStopReason } from "../features/category-discipline.js";
import { spawnFollowThroughStopReason } from "../features/spawn-followthrough.js";
import { loadRalph, processLoopStop } from "../features/ralph.js";
import { isDoneMessage } from "../features/ralph.js";
import { allTodosCompleteStopReason, boulderStopReason, clearBoulder, hasOpenPlanCheckboxes, incompleteTodos, isStopPaused, isTodoEnforcerCircuitOpen, loadBoulder, markTodoContinued, todoEnforcerAllows, todoStopReason, } from "../features/todo-boulder.js";
export function handleStop(input, cfg) {
    if (isVerifiedMessage(input.lastAssistantMessage)) {
        markVerified(input, cfg);
    }
    if (isStopPaused(input, cfg)) {
        return {};
    }
    const idle = isIdleAssistantMessage(input.lastAssistantMessage);
    // 1. Ralph / ULW v2
    const ralph = loadRalph(input, cfg);
    if (ralph) {
        const result = processLoopStop(input, cfg, ralph);
        if (result.block) {
            let reason = result.reason;
            if (idle && !/STALL DETECTED/.test(reason)) {
                reason = [
                    idleTurnStopReason("ULW/Ralph loop still active."),
                    "",
                    reason,
                ].join("\n");
            }
            return { decision: "block", reason };
        }
        // loop ended cleanly — fall through other stop checks
    }
    // 2. Boulder — stay active until plan checkboxes closed + DONE, or /cancel-boulder
    const boulder = loadBoulder(input, cfg);
    if (boulder) {
        const openPlan = hasOpenPlanCheckboxes(input, cfg);
        if (openPlan) {
            return {
                decision: "block",
                reason: [boulderStopReason(boulder), openPlan].join("\n"),
            };
        }
        // Plan checkboxes complete: allow DONE/VERIFIED to clear boulder
        if (isDoneMessage(input.lastAssistantMessage) ||
            isVerifiedMessage(input.lastAssistantMessage)) {
            clearBoulder(input, cfg);
        }
        else {
            return {
                decision: "block",
                reason: [
                    boulderStopReason(boulder),
                    "Plan checkboxes look complete. Emit <promise>DONE</promise> (or VERIFIED) to close boulder, or /cancel-boulder.",
                ].join("\n"),
            };
        }
    }
    // 2.5 Category discipline — specialist work + zero spawns (once per session)
    const catDisc = categoryDisciplineStopReason(input, cfg);
    if (catDisc) {
        return { decision: "block", reason: catDisc };
    }
    // 2.6 Spawn follow-through — just spawned + idle/announce only (once per wave)
    const follow = spawnFollowThroughStopReason(input, cfg);
    if (follow) {
        return { decision: "block", reason: follow };
    }
    // 3. Todos (+ idle-turn / abort-window yank when work unfinished)
    const todos = incompleteTodos(input, cfg);
    if (todos.length > 0) {
        const gate = todoEnforcerAllows(input, cfg);
        // omo-style circuit: stagnation / max continues → stop nagging (even on idle)
        if (!isTodoEnforcerCircuitOpen(gate.reason) && (gate.allow || idle)) {
            // Idle fluff bypasses cooldown; abort-window already sets allow=true
            if (gate.allow || idle)
                markTodoContinued(input, cfg, Date.now(), todos);
            const parts = [];
            if (idle)
                parts.push(idleTurnStopReason("Incomplete todos remain."), "");
            if (gate.reason === "todo-enforcer-abort-window") {
                parts.push("TODO ABORT-WINDOW — previous stop looked aborted/errored; re-yanking despite cooldown.", "");
            }
            parts.push(todoStopReason(todos));
            return { decision: "block", reason: parts.join("\n") };
        }
    }
    else {
        // 3b. omo #4111 — all closed: one-shot summary signal (no silent freeze)
        const allDone = allTodosCompleteStopReason(input, cfg, {
            idle,
            message: input.lastAssistantMessage,
        });
        if (allDone) {
            return { decision: "block", reason: allDone };
        }
    }
    // 4. Diagnostics
    const diag = diagStopReason(input, cfg);
    if (diag) {
        const st = loadDiag(input, cfg);
        if (st.lastErrors) {
            return { decision: "block", reason: diag };
        }
        if (st.needsVerify && !cfg.diagCommand && !st.softPrompted) {
            markSoftPrompted(input, cfg);
            return { decision: "block", reason: diag };
        }
    }
    // 5. Plan checkboxes
    const planMsg = hasOpenPlanCheckboxes(input, cfg);
    if (planMsg) {
        return { decision: "block", reason: planMsg };
    }
    // 6. Comment slop aggregate (soft once)
    const commentAgg = commentAggregateStopReason(input, cfg);
    if (commentAgg) {
        markCommentSoftPrompted(input, cfg);
        return { decision: "block", reason: commentAgg };
    }
    return {};
}
//# sourceMappingURL=stop.js.map