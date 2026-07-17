/**
 * Lightweight SessionStart resume summary — active ULW/Ralph, boulder, handoff pointer.
 * Not full project-memory; reads existing .omg state only.
 */
import type { EnvConfig, HookInput } from "../protocol/types.js";
import { findLatestHandoff } from "./handoff.js";
import { loadRalph } from "./ralph.js";
import {
  hasOpenPlanCheckboxes,
  incompleteTodos,
  loadBoulder,
} from "./todo-boulder.js";

export function sessionResumeSummary(
  input: HookInput,
  cfg: EnvConfig,
): string {
  const lines: string[] = [];

  const ralph = loadRalph(input, cfg);
  if (ralph?.active) {
    const open = (ralph.goals || []).filter((g) => !g.done);
    const goalBit =
      open.length > 0
        ? ` openGoals=${open.length}/${ralph.goals?.length || 0}`
        : ralph.goals?.length
          ? " all goals marked done"
          : "";
    lines.push(
      `- **${ralph.mode.toUpperCase()}** active: ${ralph.task.slice(0, 120)}${ralph.task.length > 120 ? "…" : ""}`,
      `  iter ${ralph.iteration}/${ralph.maxIterations} phase=${ralph.phase}${goalBit}`,
    );
    if (ralph.mode === "ulw") {
      lines.push(
        "  **ULTRAWORK MODE ENABLED** — 开场仪式: first line `ULTRAWORK MODE ENABLED!` / `ULTRAWORK 模式已启动！` then goal + explore; skip opener → Stop CEREMONY INCOMPLETE; see `.omg/ulw-loop/CEREMONY.md`",
      );
    }
  }

  const boulder = loadBoulder(input, cfg);
  if (boulder?.active) {
    lines.push(
      `- **Boulder** active: ${boulder.title || "untitled"}`,
      boulder.planPath ? `  plan: ${boulder.planPath}` : "",
    );
    const openPlan = hasOpenPlanCheckboxes(input, cfg);
    if (openPlan) {
      lines.push(
        "  ⚠ open plan checkboxes remain — finish or cancel-boulder before DONE",
      );
    }
  }

  const todos = incompleteTodos(input, cfg);
  if (todos.length > 0) {
    const preview = todos
      .slice(0, 4)
      .map((t) => t.content || "?")
      .join("; ");
    lines.push(
      `- **Todos** incomplete: ${todos.length} — ${preview}${todos.length > 4 ? "…" : ""}`,
    );
  }

  const handoff = findLatestHandoff(
    input.workspaceRoot,
    cfg,
    input.sessionId,
  );
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
