import type { EnvConfig, HookEvent, HookInput } from "./types.js";
/** Grok PostToolUse sends toolResult (object or string); normalize to text. */
export declare function coerceToolOutput(raw: Record<string, unknown>): string;
/** Prefer workspace-aware config after we know workspaceRoot. */
export declare function readEnvConfig(workspaceRoot?: string): EnvConfig;
/**
 * Flatten nested MCP/host envelopes one+ levels:
 * `{ arguments: { path, contents } }` / `{ parameters: … }` / `{ input: … }`.
 * Without this, pathsFromToolInput sees [] → workspace/Hashline/plan gates miss.
 * v1.1.42
 */
export declare function unwrapToolInput(toolInput?: Record<string, unknown> | null): Record<string, unknown> | undefined;
/**
 * Parse Grok Build hook envelope (camelCase flatten) + legacy aliases.
 * @see xai-grok-hooks HookEventEnvelope
 */
export declare function parseHookInput(event: HookEvent, raw: Record<string, unknown>): HookInput;
export declare function readStdinJson(): Promise<Record<string, unknown>>;
export declare function emit(output: unknown, exitCode?: number): never;
