import type { EnvConfig, HookInput, HookOutput } from "../protocol/types.js";
export declare function handlePostToolRead(input: HookInput, cfg: EnvConfig): HookOutput;
export declare function handlePostToolTodo(input: HookInput, cfg: EnvConfig): HookOutput;
export declare function handlePostToolWrite(input: HookInput, cfg: EnvConfig): HookOutput;
/** PostTool for Bash/Shell/run_terminal_command — ULW shell + verify evidence. */
export declare function handlePostToolShell(input: HookInput, cfg: EnvConfig): HookOutput;
/**
 * PostTool spawn / task-output recovery.
 * - get_task_output (etc.) → clear follow-through pending (result recovered)
 * - spawn with empty/short output → arm follow-through
 * - spawn with substantial inline toolOutput → treat as recovered (no yank arm)
 *
 * Does NOT sticky-lock parent session to child role (Grok SubagentStart/PostTool
 * spawn fire on the parent session — sticky explore would AGENT_GUARD parent writes).
 * Sticky role only via /agent or host agentName (user-prompt / tool envelope).
 */
export declare function handlePostToolSpawn(input: HookInput, cfg: EnvConfig): HookOutput;
