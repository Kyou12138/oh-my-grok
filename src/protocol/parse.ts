import type { EnvConfig, HookEvent, HookInput } from "./types.js";

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

function firstString(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === "string" && v.length > 0) return v;
  }
  return "";
}

export function readEnvConfig(): EnvConfig {
  const home =
    process.env.GROK_HOME ||
    process.env.USERPROFILE ||
    process.env.HOME ||
    "";
  const pluginRoot = process.env.GROK_PLUGIN_ROOT || process.cwd();
  const pluginData =
    process.env.GROK_PLUGIN_DATA ||
    (home ? `${home.replace(/\\/g, "/")}/.grok/state/oh-my-grok` : `${pluginRoot}/.omg-plugin-data`);

  return {
    pluginRoot,
    pluginData,
    grokHome: home ? `${home.replace(/\\/g, "/")}/.grok` : "",
    stateDirName: process.env.OMG_STATE_DIR || ".omg",
    skillGate: process.env.OMG_SKILL_GATE !== "0",
    intentGate: process.env.OMG_INTENT_GATE !== "0",
    planMode: process.env.OMG_PLAN_MODE !== "0",
    maxRalphIter: Number(process.env.OMG_MAX_RALPH_ITER || "50") || 50,
    todoCooldownMs: Number(process.env.OMG_TODO_COOLDOWN_MS || "5000") || 5000,
    todoAbortWindowMs: Number(process.env.OMG_TODO_ABORT_WINDOW_MS || "3000") || 3000,
  };
}

export function parseHookInput(event: HookEvent, raw: Record<string, unknown>): HookInput {
  const toolInputRaw = raw.toolInput ?? raw.tool_input ?? raw.input;
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

  return {
    raw,
    event,
    sessionId,
    cwd,
    workspaceRoot,
    prompt: firstString(raw.prompt, raw.userPrompt, raw.user_prompt) || undefined,
    toolName: firstString(raw.toolName, raw.tool_name, raw.name) || undefined,
    toolInput,
    stopReason: firstString(raw.stopReason, raw.stop_reason, raw.reason) || undefined,
    lastAssistantMessage:
      firstString(
        raw.last_assistant_message,
        raw.lastAssistantMessage,
        raw.assistantMessage,
        raw.message,
      ) || undefined,
    isFirstPrompt: Boolean(raw.isFirstPrompt ?? raw.is_first_prompt ?? raw.firstPrompt),
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

export function envFlag(name: string, defaultOn = true): boolean {
  const v = process.env[name];
  if (v === undefined) return defaultOn;
  return v !== "0" && v.toLowerCase() !== "false";
}

export function asStr(v: unknown): string {
  return str(v);
}
