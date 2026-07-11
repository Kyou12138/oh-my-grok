import type { EnvConfig, HookInput, HookOutput } from "../protocol/types.js";
import { markDirty, runDiagCommand } from "../features/diagnostics.js";
import { recordRead } from "../features/hashline.js";
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

export function handlePostToolRead(input: HookInput, cfg: EnvConfig): HookOutput {
  const file = fileFromInput(input);
  if (file) {
    if (/skill\.md$/i.test(file)) {
      markSkillLoaded(input, cfg, file);
    }
    recordRead(input, cfg, file);
  }
  return {};
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
  // Refresh hashline cache after successful write so next edit sees new content
  if (file) recordRead(input, cfg, file);
  if (cfg.diagCommand) {
    runDiagCommand(input, cfg);
  }
  return {};
}
