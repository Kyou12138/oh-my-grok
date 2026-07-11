import type { EnvConfig, HookInput, HookOutput } from "../protocol/types.js";
import {
  diagStopReason,
  isVerifiedMessage,
  loadDiag,
  markSoftPrompted,
  markVerified,
} from "../features/diagnostics.js";
import { loadRalph, processLoopStop } from "../features/ralph.js";
import { isDoneMessage } from "../features/ralph.js";
import {
  boulderStopReason,
  clearBoulder,
  hasOpenPlanCheckboxes,
  incompleteTodos,
  isStopPaused,
  loadBoulder,
  markTodoContinued,
  todoEnforcerAllows,
  todoStopReason,
} from "../features/todo-boulder.js";

export function handleStop(input: HookInput, cfg: EnvConfig): HookOutput {
  if (isVerifiedMessage(input.lastAssistantMessage)) {
    markVerified(input, cfg);
  }

  if (isStopPaused(input, cfg)) {
    return {};
  }

  // 1. Ralph / ULW v2
  const ralph = loadRalph(input, cfg);
  if (ralph) {
    const result = processLoopStop(input, cfg, ralph);
    if (result.block) {
      return { decision: "block", reason: result.reason };
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
    if (
      isDoneMessage(input.lastAssistantMessage) ||
      isVerifiedMessage(input.lastAssistantMessage)
    ) {
      clearBoulder(input, cfg);
    } else {
      return {
        decision: "block",
        reason: [
          boulderStopReason(boulder),
          "Plan checkboxes look complete. Emit <promise>DONE</promise> (or VERIFIED) to close boulder, or /cancel-boulder.",
        ].join("\n"),
      };
    }
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
