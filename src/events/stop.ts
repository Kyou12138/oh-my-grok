import type { EnvConfig, HookInput, HookOutput } from "../protocol/types.js";
import {
  bumpRalph,
  cancelRalph,
  isDoneMessage,
  loadRalph,
  ralphStopReason,
} from "../features/ralph.js";
import {
  boulderStopReason,
  hasOpenPlanCheckboxes,
  incompleteTodos,
  isStopPaused,
  loadBoulder,
  markTodoContinued,
  todoEnforcerAllows,
  todoStopReason,
} from "../features/todo-boulder.js";

export function handleStop(input: HookInput, cfg: EnvConfig): HookOutput {
  // If assistant already signaled done for ralph
  const ralph = loadRalph(input, cfg);
  if (ralph && isDoneMessage(input.lastAssistantMessage)) {
    cancelRalph(input, cfg);
    return {};
  }

  if (isStopPaused(input, cfg)) {
    return {};
  }

  // 1. Ralph / ULW
  if (ralph) {
    if (ralph.iteration >= ralph.maxIterations) {
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
    bumpRalph(input, cfg, ralph);
    return { decision: "block", reason: ralphStopReason(ralph) };
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

  // 4. Plan checkboxes
  const planMsg = hasOpenPlanCheckboxes(input, cfg);
  if (planMsg) {
    return { decision: "block", reason: planMsg };
  }

  return {};
}
