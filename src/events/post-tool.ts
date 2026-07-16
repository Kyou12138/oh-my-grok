import type { EnvConfig, HookInput, HookOutput } from "../protocol/types.js";
import { commentCheckerPostWarn } from "../features/comment-checker.js";
import { collectDirectoryContext } from "../features/directory-inject.js";
import { markDirty, runDiagCommand } from "../features/diagnostics.js";
import { recordRead } from "../features/hashline.js";
import {
  activateHostPlanMode,
  endPlanMode,
  isHostEnterPlanTool,
  isHostExitPlanTool,
} from "../features/prometheus.js";
import {
  isVerifyShellCommand,
  noteUlwRead,
  noteUlwShell,
  noteUlwWrite,
} from "../features/ralph.js";
import { extractSpawnRole, isSpawnTool } from "../features/session-role.js";
import { markSkillLoaded } from "../features/skill-gate.js";
import { markSpawnActivity } from "../features/category-discipline.js";
import {
  clearSpawnFollowThrough,
  isInlineSubagentResult,
  isResultRecoveryTool,
  markSpawnFollowThrough,
} from "../features/spawn-followthrough.js";
import {
  applyTodoUpdates,
  extractTodosFromToolInput,
  incompleteTodos,
  isPlanMarkdownPath,
  isTodoMergeMode,
  resetTodoEnforcer,
  syncTodosFromPlanCheckboxes,
} from "../features/todo-boulder.js";
import { pathsFromToolInput } from "../features/tool-paths.js";

function fileFromInput(input: HookInput): string {
  const paths = pathsFromToolInput(input.toolInput);
  if (paths.length) return paths[0];
  return String(
    input.toolInput?.file_path ??
      input.toolInput?.path ??
      input.toolInput?.filePath ??
      input.toolInput?.target_file ??
      "",
  );
}

function filesFromInput(input: HookInput): string[] {
  const paths = pathsFromToolInput(input.toolInput);
  if (paths.length) return paths;
  const one = fileFromInput(input);
  return one ? [one] : [];
}

function mergeContext(...parts: string[]): HookOutput {
  const additionalContext = parts.filter(Boolean).join("\n\n");
  return additionalContext ? { additionalContext } : {};
}

export function handlePostToolRead(input: HookInput, cfg: EnvConfig): HookOutput {
  const file = fileFromInput(input);
  const parts: string[] = [];
  if (file) {
    if (/skill\.md$/i.test(file)) {
      markSkillLoaded(input, cfg, file);
    }
    const entry = recordRead(input, cfg, file);
    noteUlwRead(input, cfg, file);
    if (entry?.annotatedPreview) {
      parts.push(
        [
          "<HASHLINE_READ>",
          `File: ${entry.path}`,
          `hash=${entry.contentHash} lines=${entry.lineCount}`,
          "LINE#ID anchors (use for precise edits; keep tags matching):",
          "```",
          entry.annotatedPreview,
          "```",
          "</HASHLINE_READ>",
        ].join("\n"),
      );
    }
    const dirCtx = collectDirectoryContext(input.workspaceRoot, file);
    if (dirCtx) parts.push(dirCtx);
  }
  return mergeContext(...parts);
}

export function handlePostToolTodo(input: HookInput, cfg: EnvConfig): HookOutput {
  const updates = extractTodosFromToolInput(input.toolInput);
  if (!updates.length) return {};
  // Grok todo_write defaults merge=true — partial id+status must not wipe mirror
  const merge = isTodoMergeMode(input.toolInput);
  applyTodoUpdates(input, cfg, updates, merge);
  // Reset enforcer only when *all* mirrored todos are closed (not just this batch)
  if (incompleteTodos(input, cfg).length === 0) {
    resetTodoEnforcer(input, cfg);
  }
  return {};
}

export function handlePostToolWrite(input: HookInput, cfg: EnvConfig): HookOutput {
  const files = filesFromInput(input);
  const primary = files[0] || "";
  // v1.1.24: mark every touched path dirty (diag), not only primary
  if (files.length) {
    for (const file of files) markDirty(input, cfg, file);
  } else {
    markDirty(input, cfg, primary || undefined);
  }
  noteUlwWrite(input, cfg, primary || undefined);
  // MultiEdit / apply_patch — recache every touched path
  for (const file of files) {
    recordRead(input, cfg, file);
    if (isPlanMarkdownPath(file, input, cfg)) {
      syncTodosFromPlanCheckboxes(input, cfg, file);
    }
  }
  if (cfg.diagCommand) {
    runDiagCommand(input, cfg);
  }
  const warn = commentCheckerPostWarn(input, cfg);
  return mergeContext(warn);
}

function commandFromInput(input: HookInput): string {
  return String(
    input.toolInput?.command ??
      input.toolInput?.cmd ??
      input.toolInput?.script ??
      input.toolInput?.bash ??
      "",
  );
}

/** PostTool for Bash/Shell/run_terminal_command — ULW shell + verify evidence. */
export function handlePostToolShell(input: HookInput, cfg: EnvConfig): HookOutput {
  const command = commandFromInput(input);
  noteUlwShell(input, cfg, command || undefined);
  if (isVerifyShellCommand(command)) {
    return mergeContext(
      [
        "<OMG_ULW_SHELL>",
        "Verification-style shell observed — ULW verify phase credited if a loop is active.",
        `command: ${command.slice(0, 200)}`,
        "When checks are clean, emit <promise>VERIFIED</promise> then <promise>DONE</promise>.",
        "</OMG_ULW_SHELL>",
      ].join("\n"),
    );
  }
  return {};
}

/**
 * PostTool spawn / task-output recovery.
 * - get_task_output (etc.) → clear follow-through pending (result recovered)
 * - spawn with empty/short output → arm follow-through
 * - spawn with substantial inline toolOutput → treat as recovered (no yank arm)
 *
 * Does NOT sticky-lock parent session to child role (Grok SubagentStart/PostTool
 * spawn fire on the parent session — sticky explore would AGENT_GUARD parent writes).
 * Sticky role only via /agent or host agentName (user-prompt / tool envelope).
 */
export function handlePostToolSpawn(input: HookInput, cfg: EnvConfig): HookOutput {
  // Result recovery tools clear pending even when not a spawn
  if (isResultRecoveryTool(input.toolName)) {
    clearSpawnFollowThrough(input, cfg);
    return mergeContext(
      "<OMG_SPAWN_FOLLOWTHROUGH recovered=\"true\">Subagent/task output retrieved — follow-through cleared. Integrate findings next.</OMG_SPAWN_FOLLOWTHROUGH>",
    );
  }

  const isSpawn = isSpawnTool(input.toolName) || !!extractSpawnRole(input.toolInput);
  if (!isSpawn) return {};
  markSpawnActivity(input, cfg);
  const role = extractSpawnRole(input.toolInput);
  const out = String(input.toolOutput || "");
  if (isInlineSubagentResult(out)) {
    clearSpawnFollowThrough(input, cfg);
    return mergeContext(
      role
        ? `<OMG_SPAWN role="${role}" inline="true">Inline subagent result observed — follow-through not armed. Parent session role unchanged.</OMG_SPAWN>`
        : "",
    );
  }
  markSpawnFollowThrough(input, cfg, role || undefined);
  return mergeContext(
    role
      ? `<OMG_SPAWN role="${role}" followthrough="armed">Spawned **${role}** — recover result before idle stop. Parent session agent role is unchanged (not sticky-locked to child).</OMG_SPAWN>`
      : `<OMG_SPAWN followthrough="armed">Spawn armed follow-through. Parent session agent role unchanged.</OMG_SPAWN>`,
  );
}

/**
 * Host enter_plan_mode / exit_plan_mode — sync oh-my-grok plan-mode gate (v1.1.8).
 * Grok Build ships these tools natively; without sync, PreTool planModeDeny never arms.
 */
export function handlePostToolPlan(input: HookInput, cfg: EnvConfig): HookOutput {
  if (isHostEnterPlanTool(input.toolName)) {
    const st = activateHostPlanMode(input, cfg, "enter_plan_mode");
    return mergeContext(
      [
        "<OMG_PROMETHEUS host=\"enter_plan_mode\">",
        "Host plan mode entered — oh-my-grok plan-mode gate is **active**.",
        "Write only under `.omg/plans/` until exit_plan_mode or /start-work.",
        st.planFile ? `Existing planFile: ${st.planFile}` : "No plan file yet — create under .omg/plans/.",
        "</OMG_PROMETHEUS>",
      ].join("\n"),
    );
  }
  if (isHostExitPlanTool(input.toolName)) {
    endPlanMode(input, cfg);
    return mergeContext(
      "<OMG_PROMETHEUS host=\"exit_plan_mode\">Host exited plan mode — plan-mode write gate cleared.</OMG_PROMETHEUS>",
    );
  }
  return {};
}
