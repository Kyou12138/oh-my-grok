import type { EnvConfig, HookInput, HookOutput } from "../protocol/types.js";
import { commentCheckerPostWarn } from "../features/comment-checker.js";
import { collectDirectoryContext } from "../features/directory-inject.js";
import { markDirty, runDiagCommand } from "../features/diagnostics.js";
import { recordRead } from "../features/hashline.js";
import {
  isVerifyShellCommand,
  noteUlwRead,
  noteUlwShell,
  noteUlwWrite,
} from "../features/ralph.js";
import { markSkillLoaded } from "../features/skill-gate.js";
import {
  extractTodosFromToolInput,
  mirrorTodos,
  resetTodoEnforcer,
} from "../features/todo-boulder.js";

function fileFromInput(input: HookInput): string {
  return String(
    input.toolInput?.file_path ??
      input.toolInput?.path ??
      input.toolInput?.filePath ??
      input.toolInput?.target_file ??
      "",
  );
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
  const todos = extractTodosFromToolInput(input.toolInput);
  if (todos.length) {
    mirrorTodos(input, cfg, todos);
    const open = todos.filter((t) => {
      const s = t.status.toLowerCase();
      return s !== "completed" && s !== "done" && s !== "cancelled" && s !== "canceled";
    });
    if (open.length === 0) resetTodoEnforcer(input, cfg);
  }
  return {};
}

export function handlePostToolWrite(input: HookInput, cfg: EnvConfig): HookOutput {
  const file = fileFromInput(input);
  markDirty(input, cfg, file || undefined);
  noteUlwWrite(input, cfg, file || undefined);
  // Refresh hashline cache after successful write so next edit sees new content
  if (file) recordRead(input, cfg, file);
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
