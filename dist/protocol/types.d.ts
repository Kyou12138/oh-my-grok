/** Normalized hook I/O — Grok Build contract (mihazs-aligned). */
export type HookEvent = "session-start" | "user-prompt" | "pre-tool-use" | "post-tool-read" | "post-tool-todo" | "post-tool-write" | "post-tool-shell" | "post-tool-spawn" | "stop" | "session-end";
export interface HookInput {
    raw: Record<string, unknown>;
    event: HookEvent;
    sessionId: string;
    cwd: string;
    workspaceRoot: string;
    prompt?: string;
    toolName?: string;
    toolInput?: Record<string, unknown>;
    /** PostToolUse may include tool output text */
    toolOutput?: string;
    stopReason?: string;
    lastAssistantMessage?: string;
    isFirstPrompt?: boolean;
    /** Active agent / subagent role when provided by host */
    agentName?: string;
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
    hashline: boolean;
    diagEnforce: boolean;
    hardOrchestration: boolean;
    maxRalphIter: number;
    todoCooldownMs: number;
    todoAbortWindowMs: number;
    /** Shell command for post-edit diagnostics; empty = off */
    diagCommand: string;
    diagTimeoutMs: number;
    hashlineTtlMs: number;
    /** Soft-warn AI-slop comments after writes */
    commentChecker: boolean;
    /** Hard-deny writes that contain AI-slop comments */
    commentCheckerDeny: boolean;
    /** Enforce read-only agent permissions */
    agentGuard: boolean;
    /** Block Stop once when specialist-category work has zero subagent spawns */
    categoryDiscipline: boolean;
}
