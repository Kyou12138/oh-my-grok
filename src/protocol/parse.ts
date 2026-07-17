import { loadConfig } from "../features/config.js";
import type { EnvConfig, HookEvent, HookInput } from "./types.js";

function firstString(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === "string" && v.length > 0) return v;
  }
  return "";
}

/** Grok PostToolUse sends toolResult (object or string); normalize to text. */
export function coerceToolOutput(raw: Record<string, unknown>): string {
  const candidates = [
    raw.toolResult,
    raw.tool_result,
    raw.toolOutput,
    raw.tool_output,
    raw.output,
    raw.result,
  ];
  for (const v of candidates) {
    if (typeof v === "string" && v.length > 0) return v;
    if (v !== undefined && v !== null && typeof v === "object") {
      try {
        return JSON.stringify(v);
      } catch {
        /* ignore */
      }
    }
  }
  return "";
}

/** Prefer workspace-aware config after we know workspaceRoot. */
export function readEnvConfig(workspaceRoot?: string): EnvConfig {
  return loadConfig(workspaceRoot);
}

/**
 * Keys that mean this object is already a usable tool-arg envelope
 * (file edit / shell / spawn / todos) — do not dig further.
 */
const TOOL_ARG_KEYS = [
  "path",
  "file_path",
  "filePath",
  "filepath",
  "target_file",
  "targetFile",
  "target_path",
  "targetPath",
  "target",
  "filename",
  "file",
  "notebook_path",
  "notebookPath",
  "notebook",
  "contents",
  "content",
  "body",
  "text",
  "old_string",
  "oldString",
  "new_string",
  "newString",
  "new_text",
  "newText",
  "replacement",
  "source",
  "edits",
  "files",
  "operations",
  "changes",
  "command",
  "cmd",
  "script",
  "patch",
  "diff",
  "todos",
  "items",
  "todo",
  // spawn / task
  "subagent_type",
  "subagentType",
  "agent",
  "agent_type",
  "agentType",
  "prompt",
  "description",
  // skill loaders
  "skill",
  "skill_name",
  "skillName",
] as const;

function looksLikeToolArgs(o: Record<string, unknown>): boolean {
  return TOOL_ARG_KEYS.some((k) => o[k] !== undefined && o[k] !== null);
}

/**
 * Flatten nested MCP/host envelopes one+ levels:
 * `{ arguments: { path, contents } }` / `{ parameters: … }` / `{ input: … }`.
 * Without this, pathsFromToolInput sees [] → workspace/Hashline/plan gates miss.
 * v1.1.42
 */
export function unwrapToolInput(
  toolInput?: Record<string, unknown> | null,
): Record<string, unknown> | undefined {
  if (!toolInput || typeof toolInput !== "object" || Array.isArray(toolInput)) {
    return toolInput ?? undefined;
  }
  if (looksLikeToolArgs(toolInput)) return toolInput;

  for (const key of [
    "arguments",
    "parameters",
    "params",
    "input",
    "args",
    "tool_input",
    "toolInput",
    "toolArgs",
    "payload",
    "body",
    "data",
    "request",
    // nested OpenAI/Claude style: { function: { arguments } } / { call: { parameters } }
    "function",
    "call",
  ]) {
    const inner = toolInput[key];
    if (!inner || typeof inner !== "object" || Array.isArray(inner)) continue;
    const unwrapped = unwrapToolInput(inner as Record<string, unknown>);
    if (unwrapped && looksLikeToolArgs(unwrapped)) return unwrapped;
  }
  return toolInput;
}

/**
 * Parse Grok Build hook envelope (camelCase flatten) + legacy aliases.
 * @see xai-grok-hooks HookEventEnvelope
 */
export function parseHookInput(event: HookEvent, raw: Record<string, unknown>): HookInput {
  // Prefer toolInput/tool_input; keep raw.input last (legacy; also used as nested bag).
  const toolInputRaw =
    raw.toolInput ??
    raw.tool_input ??
    raw.toolArgs ??
    raw.tool_args ??
    raw.input;
  let toolInput: Record<string, unknown> | undefined;
  if (toolInputRaw && typeof toolInputRaw === "object" && !Array.isArray(toolInputRaw)) {
    toolInput = toolInputRaw as Record<string, unknown>;
  } else if (typeof toolInputRaw === "string") {
    try {
      toolInput = JSON.parse(toolInputRaw) as Record<string, unknown>;
    } catch {
      toolInput = { raw: toolInputRaw };
    }
  }
  // v1.1.42: nested arguments/parameters → flat tool args for all PreTool gates
  if (toolInput) {
    toolInput = unwrapToolInput(toolInput) ?? toolInput;
  }

  const cwd = firstString(raw.cwd, raw.Cwd, process.cwd());
  const workspaceRoot = firstString(
    raw.workspaceRoot,
    raw.workspace_root,
    process.env.GROK_WORKSPACE_ROOT,
    cwd,
  );
  const sessionId = firstString(
    raw.sessionId,
    raw.session_id,
    process.env.GROK_SESSION_ID,
    "default",
  );

  const toolOutput = coerceToolOutput(raw) || undefined;
  const subagentType =
    firstString(raw.subagentType, raw.subagent_type) || undefined;

  const agentFromHost = firstString(
    raw.agentName,
    raw.agent_name,
    raw.agent,
    raw.agentType,
    raw.agent_type,
    subagentType,
    process.env.GROK_AGENT_NAME,
    process.env.OMG_AGENT_ROLE,
  );

  return {
    raw,
    event,
    sessionId,
    cwd,
    workspaceRoot,
    prompt: firstString(raw.prompt, raw.userPrompt, raw.user_prompt) || undefined,
    toolName: firstString(raw.toolName, raw.tool_name, raw.name) || undefined,
    toolInput,
    toolOutput,
    toolUseId: firstString(raw.toolUseId, raw.tool_use_id) || undefined,
    stopReason: firstString(raw.stopReason, raw.stop_reason, raw.reason) || undefined,
    lastAssistantMessage:
      firstString(
        raw.last_assistant_message,
        raw.lastAssistantMessage,
        raw.assistantMessage,
        raw.message,
      ) || undefined,
    isFirstPrompt: Boolean(raw.isFirstPrompt ?? raw.is_first_prompt ?? raw.firstPrompt),
    agentName: agentFromHost || undefined,
    subagentType,
  };
}

export async function readStdinJson(): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { _parseError: true, _raw: text.slice(0, 500) };
  }
}

export function emit(output: unknown, exitCode = 0): never {
  if (output !== undefined && output !== null) {
    const s = typeof output === "string" ? output : JSON.stringify(output);
    process.stdout.write(s.endsWith("\n") ? s : s + "\n");
  }
  process.exit(exitCode);
}
