/**
 * Agent role hard permissions — read-only specialists cannot mutate files.
 * Role sources: HookInput.agentName, env, raw payload, sticky session role.
 */
import type { EnvConfig, HookInput } from "../protocol/types.js";
/** Host shell/terminal tool names (letters-only normalize). */
export declare function isShellTool(toolName?: string): boolean;
/**
 * Shell commands that mutate the workspace (read-only / plan / prometheus gates).
 * Allows ls/rg/git status/npm test; blocks redirects, rm, git commit, package install,
 * and v1.1.37 one-liner write bypasses (node -e writeFileSync, python -c open w, curl -o).
 */
export declare function isMutatingShellCommand(command?: string): boolean;
/**
 * Extract shell command string from tool input (command/cmd/script/…).
 * v1.1.38: argv arrays must join with spaces — `String(["node","-e",…])` becomes
 * `node,-e,…` which breaks `-e` / write detection and open read-only/plan gates.
 */
export declare function getShellCommand(input: HookInput): string;
/** Agents that must not write/edit/delete. */
export declare const READ_ONLY_AGENTS: Set<string>;
/** Atlas may write but should not re-delegate infinitely — soft only. */
export declare const NO_DELEGATE_AGENTS: Set<string>;
export declare function resolveAgentRole(input: HookInput, cfg?: EnvConfig): string;
export declare function isReadOnlyAgent(role: string): boolean;
export declare function agentGuardDeny(input: HookInput, cfg: EnvConfig): string | null;
export declare function agentGuardBanner(role: string): string;
