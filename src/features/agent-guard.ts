/**
 * Agent role hard permissions — read-only specialists cannot mutate files.
 * Role sources: HookInput.agentName, env, raw payload, sticky session role.
 */
import type { EnvConfig, HookInput } from "../protocol/types.js";
import {
  getSessionAgentRole,
  isSpawnTool,
  loadSessionAgentRoleState,
} from "./session-role.js";
import { isMutatingTool, normalizeToolName } from "./skill-gate.js";

/** Host shell/terminal tool names (letters-only normalize). */
export function isShellTool(toolName?: string): boolean {
  if (!toolName) return false;
  const n = normalizeToolName(toolName);
  return (
    n === "bash" ||
    n === "shell" ||
    n === "execute" ||
    n === "localshell" ||
    n === "runterminalcommand" ||
    n === "runterminal" ||
    n.includes("runterminal")
  );
}

/**
 * Shell commands that mutate the workspace (read-only / plan / prometheus gates).
 * Allows ls/rg/git status/npm test; blocks redirects, rm, git commit, package install,
 * and v1.1.37 one-liner write bypasses (node -e writeFileSync, python -c open w, curl -o).
 */
export function isMutatingShellCommand(command?: string): boolean {
  if (!command?.trim()) return false;
  // Drop fd redirects like 2>&1 / >&2 so they do not look like file writes
  const c = command.replace(/\d*>&\d+/g, " ");

  // stdout/stderr file redirects: >file >>file 1>file (not 2>&1 already stripped)
  if (/(?:^|[^0-9])>{1,2}\s*["']?[^&\s"'|]+/.test(c)) return true;

  if (
    /\b(tee|truncate|rm|rmdir|unlink|del|erase|rd)\b/i.test(c) ||
    /\b(mv|move|cp|copy|mkdir|md|touch|chmod|chown|ln|link)\b/i.test(c) ||
    /\b(sed|perl|ruby)\b[^|&;\n]*\s-i\b/i.test(c) ||
    /\b(Set-Content|Add-Content|Out-File|New-Item|Remove-Item|Move-Item|Copy-Item|Rename-Item)\b/i.test(
      c,
    ) ||
    /\bgit\s+(add|commit|push|checkout|reset|rebase|merge|am|apply|cherry-pick)\b/i.test(
      c,
    ) ||
    /\b(npm|pnpm|yarn)\s+(i|install|uninstall|remove|publish)\b/i.test(c) ||
    /\b(pip3?|cargo|go)\s+(install|get)\b/i.test(c)
  ) {
    return true;
  }

  // Download-to-file (curl -o / wget -O / Invoke-WebRequest -OutFile)
  if (
    /\b(curl|wget)\b[^|&;\n]*\s(-o|--output|-O)\b/i.test(c) ||
    /\bInvoke-WebRequest\b[^|&;\n]*\s-OutFile\b/i.test(c)
  ) {
    return true;
  }

  // .NET / PowerShell file APIs
  if (/\[(?:System\.)?IO\.File\]::Write/i.test(c)) return true;

  // node/python/deno/bun one-liners that write files (not bare console.log/print)
  if (
    /\b(node|nodejs|deno|bun|python3?|py)\b[^|&;\n]{0,60}\s(-e|--eval|-c)\b/i.test(
      c,
    )
  ) {
    if (
      /\b(writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|outputFileSync|outputFile)\b/i.test(
        c,
      ) ||
      /\bopen\s*\([^)]*['"]w/i.test(c) ||
      /\bPath\s*\([^)]*\)\s*\.\s*write_text\b/i.test(c) ||
      /\bwrite_text\s*\(/i.test(c) ||
      /\bfs\.write\b/i.test(c)
    ) {
      return true;
    }
  }

  return false;
}

/** Extract shell command string from tool input (command/cmd/script/…). */
export function getShellCommand(input: HookInput): string {
  const ti = input.toolInput;
  if (!ti) return "";
  return String(
    ti.command ?? ti.cmd ?? ti.script ?? ti.input ?? ti.code ?? "",
  );
}

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

function normalizeRole(role: string): string {
  let r = role.toLowerCase().trim();
  if (ROLE_ALIASES[r]) r = ROLE_ALIASES[r];
  if (r.includes(":")) r = r.split(":").pop() || r;
  if (r.startsWith("oh-my-grok-")) r = r.replace(/^oh-my-grok-/, "");
  return r;
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

  // Explicit /agent slash sticky overrides host agentName for the rest of the session
  // (needed when subagent sessions keep tagging every tool as oracle/explore).
  if (cfg) {
    const sticky = loadSessionAgentRoleState(input, cfg);
    if (sticky?.role && sticky.source === "slash-agent") {
      return normalizeRole(sticky.role);
    }
  }

  let role = (fromInput || fromEnv).toLowerCase();
  // Sticky session role when host omits agentName on subsequent tools
  if (!role && cfg) {
    role = getSessionAgentRole(input, cfg);
  }
  return normalizeRole(role);
}

export function isReadOnlyAgent(role: string): boolean {
  return READ_ONLY_AGENTS.has(role.toLowerCase());
}

export function agentGuardDeny(input: HookInput, cfg: EnvConfig): string | null {
  if (!cfg.agentGuard) return null;
  const role = resolveAgentRole(input, cfg);
  if (!role) return null;

  // v1.1.25: host-enforced spawn deny (needs PreTool matcher on task/spawn_*)
  // Read-only specialists and no-delegate executors must not re-task forever.
  if (isSpawnTool(input.toolName)) {
    if (isReadOnlyAgent(role)) {
      return [
        `[AGENT_GUARD] Agent "${role}" is read-only — cannot spawn/task subagents.`,
        "Blocked: task / spawn_subagent / call_omo_agent.",
        "Report findings only. Implementation: switch to sisyphus/hephaestus main session.",
        "Clear sticky role: /agent hephaestus  (or /agent sisyphus)",
      ].join("\n");
    }
    if (NO_DELEGATE_AGENTS.has(role)) {
      return [
        `[AGENT_GUARD] Agent "${role}" must execute, not re-delegate.`,
        "Blocked: task / spawn_subagent (no-redelegate).",
        "Do the assigned work in this session, or return results to the parent orchestrator.",
        "Clear sticky role if you are the main orchestrator: /agent sisyphus",
      ].join("\n");
    }
    return null;
  }

  // v1.1.35: read-only agents must not mutate via shell (echo > file, rm, git commit, …)
  // Needs PreTool matcher on Bash|Shell|run_terminal_command (hooks.json).
  if (isShellTool(input.toolName) && isReadOnlyAgent(role)) {
    const cmd = getShellCommand(input);
    if (isMutatingShellCommand(cmd)) {
      return [
        `[AGENT_GUARD] Agent "${role}" is read-only — mutating shell blocked.`,
        `Command: ${cmd.slice(0, 200)}${cmd.length > 200 ? "…" : ""}`,
        "Blocked: redirects (>/>>), rm/mv/cp, sed -i, git commit/push, package install, …",
        "Allowed: ls/rg/git status/npm test (read-only investigation).",
        "Implementation writes: switch to sisyphus/hephaestus — /agent hephaestus",
      ].join("\n");
    }
    return null;
  }

  if (!isMutatingTool(input.toolName)) return null;
  if (!isReadOnlyAgent(role)) return null;
  return [
    `[AGENT_GUARD] Agent "${role}" is read-only.`,
    "Blocked: Write / search_replace / Edit / Delete.",
    "Use explore/oracle/librarian/metis/momus for research and review only.",
    "Implementation: host **task** hephaestus (or stay on sisyphus/atlas main session).",
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
