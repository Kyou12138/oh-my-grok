import { diagStopReason, isVerifiedMessage, loadDiag, markSoftPrompted, markVerified, } from "../features/diagnostics.js";
import { idleTurnStopReason, isIdleAssistantMessage } from "../features/idle-turn.js";
import { loadRalph, processLoopStop } from "../features/ralph.js";
import { isDoneMessage } from "../features/ralph.js";
import { boulderStopReason, clearBoulder, hasOpenPlanCheckboxes, incompleteTodos, isStopPaused, loadBoulder, markTodoContinued, todoEnforcerAllows, todoStopReason, } from "../features/todo-boulder.js";
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
    // 3. Todos (+ idle-turn yank when fluff reply left work unfinished)
    const todos = incompleteTodos(input, cfg);
    if (todos.length > 0) {
        const gate = todoEnforcerAllows(input, cfg);
        if (gate.allow || idle) {
            // Idle fluff bypasses cooldown once so the agent cannot soft-stop on open todos
            if (gate.allow)
                markTodoContinued(input, cfg);
            const reason = idle
                ? [
                    idleTurnStopReason("Incomplete todos remain."),
                    "",
                    todoStopReason(todos),
                ].join("\n")
                : todoStopReason(todos);
            return { decision: "block", reason };
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
    return {};
}
//# sourceMappingURL=stop.js.map