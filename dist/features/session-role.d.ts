import type { EnvConfig, HookInput } from "../protocol/types.js";
export interface SessionRoleState {
    schemaVersion: 1;
    role: string;
    source: string;
    updatedAt: string;
}
export declare function getSessionAgentRole(input: HookInput, cfg: EnvConfig): string;
export declare function setSessionAgentRole(input: HookInput, cfg: EnvConfig, role: string, source?: string): void;
export declare function clearSessionAgentRole(input: HookInput, cfg: EnvConfig): void;
/** Extract role from spawn/task tool input. */
export declare function extractSpawnRole(toolInput?: Record<string, unknown>): string;
export declare function isSpawnTool(toolName?: string): boolean;
/** /agent <name> or /as <name> */
export declare function detectAgentCommand(prompt: string): {
    role: string;
} | null;
