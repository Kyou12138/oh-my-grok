/**
 * Sticky session agent role for Agent Guard when host omits agentName on later tools.
 */
import path from "node:path";
import type { EnvConfig, HookInput } from "../protocol/types.js";
import { ensureDir, readJson, removeFile, writeJsonAtomic } from "../state/fs.js";
import { pathsFor } from "../state/paths.js";

export interface SessionRoleState {
  schemaVersion: 1;
  role: string;
  source: string;
  updatedAt: string;
}

function fileFor(input: HookInput, cfg: EnvConfig): string {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  return path.join(p.session, "session-role.json");
}

export function getSessionAgentRole(input: HookInput, cfg: EnvConfig): string {
  const st = readJson<SessionRoleState | null>(fileFor(input, cfg), null);
  return (st?.role || "").toLowerCase();
}

export function setSessionAgentRole(
  input: HookInput,
  cfg: EnvConfig,
  role: string,
  source = "manual",
): void {
  const r = role.trim().toLowerCase();
  if (!r) return;
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  ensureDir(p.session);
  writeJsonAtomic(fileFor(input, cfg), {
    schemaVersion: 1,
    role: r,
    source,
    updatedAt: new Date().toISOString(),
  } satisfies SessionRoleState);
}

export function clearSessionAgentRole(input: HookInput, cfg: EnvConfig): void {
  removeFile(fileFor(input, cfg));
}

/** Extract role from spawn/task tool input. */
export function extractSpawnRole(toolInput?: Record<string, unknown>): string {
  if (!toolInput) return "";
  const raw = String(
    toolInput.subagent_type ??
      toolInput.subagentType ??
      toolInput.agent ??
      toolInput.agent_type ??
      toolInput.agentType ??
      toolInput.type ??
      "",
  ).trim();
  if (!raw) return "";
  let role = raw.toLowerCase();
  if (role.includes(":")) role = role.split(":").pop() || role;
  if (role.startsWith("oh-my-grok-")) role = role.replace(/^oh-my-grok-/, "");
  return role;
}

export function isSpawnTool(toolName?: string): boolean {
  if (!toolName) return false;
  const n = toolName.toLowerCase().replace(/[^a-z_]/g, "");
  return (
    n.includes("spawn") ||
    n === "task" ||
    n.includes("call_omo") ||
    n.includes("callomo") ||
    n === "subagent"
  );
}

/** /agent <name> or /as <name> */
export function detectAgentCommand(prompt: string): { role: string } | null {
  const m =
    prompt.trim().match(/^\/agent(?:-role)?\s+(\S+)/i) ||
    prompt.trim().match(/^\/as\s+(\S+)/i);
  if (!m) return null;
  return { role: m[1].toLowerCase() };
}
