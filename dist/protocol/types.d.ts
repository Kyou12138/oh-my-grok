/** Normalized hook I/O — Grok Build contract (mihazs-aligned). */
export type HookEvent = "session-start" | "user-prompt" | "pre-tool-use" | "post-tool-read" | "post-tool-todo" | "stop" | "session-end";
export interface HookInput {
    raw: Record<string, unknown>;
    event: HookEvent;
    sessionId: string;
    cwd: string;
    workspaceRoot: string;
    prompt?: string;
    toolName?: string;
    toolInput?: Record<string, unknown>;
    stopReason?: string;
    lastAssistantMessage?: string;
    isFirstPrompt?: boolean;
}
export type HookOutput = {
    additionalContext: string;
} | {
    decision: "allow";
} | {
    decision: "deny";
    reason: string;
} | {
    decision: "block";
    reason: string;
} | Record<string, never>;
export interface EnvConfig {
    pluginRoot: string;
    pluginData: string;
    grokHome: string;
    stateDirName: string;
    skillGate: boolean;
    intentGate: boolean;
    planMode: boolean;
    maxRalphIter: number;
    todoCooldownMs: number;
    todoAbortWindowMs: number;
}
