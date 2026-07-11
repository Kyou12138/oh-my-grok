import type { EnvConfig, HookEvent, HookInput } from "./types.js";
/** Prefer workspace-aware config after we know workspaceRoot. */
export declare function readEnvConfig(workspaceRoot?: string): EnvConfig;
export declare function parseHookInput(event: HookEvent, raw: Record<string, unknown>): HookInput;
export declare function readStdinJson(): Promise<Record<string, unknown>>;
export declare function emit(output: unknown, exitCode?: number): never;
