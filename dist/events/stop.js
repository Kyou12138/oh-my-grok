import { diagStopReason, isVerifiedMessage, loadDiag, markSoftPrompted, markVerified, } from "../features/diagnostics.js";
import { bumpRalph, cancelRalph, isDoneMessage, loadRalph, ralphStopReason, } from "../features/ralph.js";
import { boulderStopReason, hasOpenPlanCheckboxes, incompleteTodos, isStopPaused, loadBoulder, markTodoContinued, todoEnforcerAllows, todoStopReason, } from "../features/todo-boulder.js";
export function handleStop(input, cfg) {
    if (isVerifiedMessage(input.lastAssistantMessage)) {
        markVerified(input, cfg);
    }
    if (isStopPaused(input, cfg)) {
        return {};
    }
    // 1. Ralph / ULW
    const ralph = loadRalph(input, cfg);
    if (ralph) {
        if (isDoneMessage(input.lastAssistantMessage)) {
            cancelRalph(input, cfg);
        }
        else if (ralph.iteration >= ralph.maxIterations) {
            cancelRalph(input, cfg);
            return {
                decision: "block",
                reason: [
                    "RALPH/ULW max iterations reached — loop auto-cancelled.",
                    `Task was: ${ralph.task}`,
                    "Summarize progress for the user. Use /ralph-loop again if needed.",
                ].join("\n"),
            };
        }
        else {
            bumpRalph(input, cfg, ralph);
            return { decision: "block", reason: ralphStopReason(ralph) };
        }
    }
    // 2. Boulder
    const boulder = loadBoulder(input, cfg);
    if (boulder) {
        return { decision: "block", reason: boulderStopReason(boulder) };
    }
    // 3. Todos
    const todos = incompleteTodos(input, cfg);
    if (todos.length > 0) {
        const gate = todoEnforcerAllows(input, cfg);
        if (gate.allow) {
            markTodoContinued(input, cfg);
            return { decision: "block", reason: todoStopReason(todos) };
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