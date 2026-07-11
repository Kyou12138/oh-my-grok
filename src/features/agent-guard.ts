/**
 * Agent role hard permissions — read-only specialists cannot mutate files.
 * Role sources: HookInput.agentName, env, raw payload, sticky session role.
 */
import type { EnvConfig, HookInput } from "../protocol/types.js";
import { getSessionAgentRole } from "./session-role.js";
import { isMutatingTool } from "./skill-gate.js";

/** Agents that must not write/edit/delete. */
export const READ_ONLY_AGENTS = new Set([
  "oracle",
  "explore",
  "librarian",
  "metis",
  "momus",
  "multimodal-looker",
  "multimodal_looker",
  "looker",
]);

/** Atlas may write but should not re-delegate infinitely — soft only. */
export const NO_DELEGATE_AGENTS = new Set(["atlas", "momus", "sisyphus-junior", "sisyphus_junior"]);

const ROLE_ALIASES: Record<string, string> = {
  "oh-my-grok:oracle": "oracle",
  "oh-my-grok:explore": "explore",
  "oh-my-grok:librarian": "librarian",
  "oh-my-grok:metis": "metis",
  "oh-my-grok:momus": "momus",
  "oh-my-grok:atlas": "atlas",
  "oh-my-grok:hephaestus": "hephaestus",
  "oh-my-grok:prometheus": "prometheus",
  "oh-my-grok:sisyphus": "sisyphus",
};

function firstString(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export function resolveAgentRole(input: HookInput, cfg?: EnvConfig): string {
  const raw = input.raw || {};
  const fromEnv = firstString(
    process.env.GROK_AGENT_NAME,
    process.env.OMG_AGENT_ROLE,
    process.env.GROK_SUBAGENT_TYPE,
  );
  const fromInput = firstString(
    input.agentName,
    raw.agentName,
    raw.agent_name,
    raw.agent,
    raw.subagent_type,
    raw.subagentType,
    raw.agentType,
    raw.agent_type,
  );
  let role = (fromInput || fromEnv).toLowerCase();
  // Sticky session role when host omits agentName on subsequent tools
  if (!role && cfg) {
    role = getSessionAgentRole(input, cfg);
  }
  if (ROLE_ALIASES[role]) role = ROLE_ALIASES[role];
  // strip plugin prefix
  if (role.includes(":")) role = role.split(":").pop() || role;
  if (role.startsWith("oh-my-grok-")) role = role.replace(/^oh-my-grok-/, "");
  return role;
}

export function isReadOnlyAgent(role: string): boolean {
  return READ_ONLY_AGENTS.has(role.toLowerCase());
}

export function agentGuardDeny(input: HookInput, cfg: EnvConfig): string | null {
  if (!cfg.agentGuard) return null;
  if (!isMutatingTool(input.toolName)) return null;
  const role = resolveAgentRole(input, cfg);
  if (!role) return null;
  if (!isReadOnlyAgent(role)) return null;
  return [
    `[AGENT_GUARD] Agent "${role}" is read-only.`,
    "Blocked: Write / StrReplace / Edit / Delete.",
    "Use explore/oracle/librarian/metis/momus for research and review only.",
    "Implementation: spawn hephaestus or stay on sisyphus/atlas main session.",
    "Clear sticky role: /agent hephaestus  (or /agent sisyphus)",
  ].join("\n");
}

export function agentGuardBanner(role: string): string {
  if (!role) return "";
  if (isReadOnlyAgent(role)) {
    return [
      `<OMG_AGENT_GUARD role="${role}" mode="read-only">`,
      `Active agent **${role}** cannot mutate files. Report findings only.`,
      "</OMG_AGENT_GUARD>",
    ].join("\n");
  }
  if (NO_DELEGATE_AGENTS.has(role)) {
    return [
      `<OMG_AGENT_GUARD role="${role}" mode="execute-no-redelegate">`,
      `Agent **${role}**: execute assigned work; avoid infinite re-delegation.`,
      "</OMG_AGENT_GUARD>",
    ].join("\n");
  }
  return "";
}
