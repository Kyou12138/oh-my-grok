import type { EnvConfig, HookInput, HookOutput } from "../protocol/types.js";
export declare function handlePostToolRead(input: HookInput, cfg: EnvConfig): HookOutput;
export declare function handlePostToolTodo(input: HookInput, cfg: EnvConfig): HookOutput;
export declare function handlePostToolWrite(input: HookInput, cfg: EnvConfig): HookOutput;
/** PostTool for Bash/Shell/run_terminal_command — ULW shell + verify evidence. */
export declare function handlePostToolShell(input: HookInput, cfg: EnvConfig): HookOutput;
/** PostTool spawn/task — sticky session role for Agent Guard. */
export declare function handlePostToolSpawn(input: HookInput, cfg: EnvConfig): HookOutput;
