import type { EnvConfig, HookEvent, HookInput } from "./types.js";
export declare function readEnvConfig(): EnvConfig;
export declare function parseHookInput(event: HookEvent, raw: Record<string, unknown>): HookInput;
export declare function readStdinJson(): Promise<Record<string, unknown>>;
export declare function emit(output: unknown, exitCode?: number): never;
export declare function envFlag(name: string, defaultOn?: boolean): boolean;
export declare function asStr(v: unknown): string;
