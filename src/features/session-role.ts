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

export function loadSessionAgentRoleState(
  input: HookInput,
  cfg: EnvConfig,
): SessionRoleState | null {
  return readJson<SessionRoleState | null>(fileFor(input, cfg), null);
}

export function getSessionAgentRole(input: HookInput, cfg: EnvConfig): string {
  const st = loadSessionAgentRoleState(input, cfg);
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
  // v1.1.57: also name / role (some hosts use these instead of subagent_type)
  const raw = String(
    toolInput.subagent_type ??
      toolInput.subagentType ??
      toolInput.subagent ??
      toolInput.agent ??
      toolInput.agent_type ??
      toolInput.agentType ??
      toolInput.agentName ??
      toolInput.agent_name ??
      toolInput.agent_role ??
      toolInput.agentRole ??
      toolInput.selected_agent ??
      toolInput.selectedAgent ??
      toolInput.specialist ??
      toolInput.type ??
      toolInput.role ??
      toolInput.name ??
      "",
  ).trim();
  if (!raw) return "";
  let role = raw.toLowerCase();
  if (role.includes(":")) role = role.split(":").pop() || role;
  if (role.startsWith("oh-my-grok-")) role = role.replace(/^oh-my-grok-/, "");
  // drop non-role names that are too long / descriptive sentences
  if (role.includes(" ") || role.length > 40) return "";
  return role;
}

export function isSpawnTool(toolName?: string): boolean {
  if (!toolName) return false;
  // Letters-only (v1.1.7): SpawnSubagent / spawn-subagent same as spawn_subagent
  // v1.1.57: dispatch_agent / run_agent / delegate
  const n = toolName.toLowerCase().replace(/[^a-z]/g, "");
  return (
    n.includes("spawn") ||
    n === "task" ||
    n.includes("callomo") ||
    n === "subagent" ||
    n === "dispatchagent" ||
    n === "runagent" ||
    n === "delegate" ||
    n === "delegateagent"
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
