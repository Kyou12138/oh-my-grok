import type { EnvConfig, HookInput, HookOutput } from "../protocol/types.js";
import { markSkillLoaded } from "../features/skill-gate.js";
import {
  extractTodosFromToolInput,
  mirrorTodos,
  resetTodoEnforcer,
} from "../features/todo-boulder.js";

export function handlePostToolRead(input: HookInput, cfg: EnvConfig): HookOutput {
  const file = String(
    input.toolInput?.file_path ??
      input.toolInput?.path ??
      input.toolInput?.filePath ??
      input.toolInput?.target_file ??
      "",
  );
  if (file && /skill\.md$/i.test(file)) {
    markSkillLoaded(input, cfg, file);
  }
  return {};
}

export function handlePostToolTodo(input: HookInput, cfg: EnvConfig): HookOutput {
  const todos = extractTodosFromToolInput(input.toolInput);
  if (todos.length) {
    mirrorTodos(input, cfg, todos);
    // If all complete, reset enforcer
    const open = todos.filter((t) => {
      const s = t.status.toLowerCase();
      return s !== "completed" && s !== "done" && s !== "cancelled" && s !== "canceled";
    });
    if (open.length === 0) resetTodoEnforcer(input, cfg);
  }
  return {};
}
