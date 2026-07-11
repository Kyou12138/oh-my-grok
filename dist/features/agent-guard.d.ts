/**
 * Agent role hard permissions — read-only specialists cannot mutate files.
 * Role sources: HookInput.agentName, env GROK_AGENT_NAME / OMG_AGENT_ROLE, raw payload.
 */
import type { EnvConfig, HookInput } from "../protocol/types.js";
/** Agents that must not write/edit/delete. */
export declare const READ_ONLY_AGENTS: Set<string>;
/** Atlas may write but should not re-delegate infinitely — soft only. */
export declare const NO_DELEGATE_AGENTS: Set<string>;
export declare function resolveAgentRole(input: HookInput): string;
export declare function isReadOnlyAgent(role: string): boolean;
export declare function agentGuardDeny(input: HookInput, cfg: EnvConfig): string | null;
export declare function agentGuardBanner(role: string): string;
