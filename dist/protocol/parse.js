import { loadConfig } from "../features/config.js";
function firstString(...vals) {
    for (const v of vals) {
        if (typeof v === "string" && v.length > 0)
            return v;
    }
    return "";
}
/** Prefer workspace-aware config after we know workspaceRoot. */
export function readEnvConfig(workspaceRoot) {
    return loadConfig(workspaceRoot);
}
export function parseHookInput(event, raw) {
    const toolInputRaw = raw.toolInput ?? raw.tool_input ?? raw.input;
    let toolInput;
    if (toolInputRaw && typeof toolInputRaw === "object" && !Array.isArray(toolInputRaw)) {
        toolInput = toolInputRaw;
    }
    else if (typeof toolInputRaw === "string") {
        try {
            toolInput = JSON.parse(toolInputRaw);
        }
        catch {
            toolInput = { raw: toolInputRaw };
        }
    }
    const cwd = firstString(raw.cwd, raw.Cwd, process.cwd());
    const workspaceRoot = firstString(raw.workspaceRoot, raw.workspace_root, process.env.GROK_WORKSPACE_ROOT, cwd);
    const sessionId = firstString(raw.sessionId, raw.session_id, process.env.GROK_SESSION_ID, "default");
    const toolOutput = firstString(raw.toolOutput, raw.tool_output, raw.output, raw.result);
    return {
        raw,
        event,
        sessionId,
        cwd,
        workspaceRoot,
        prompt: firstString(raw.prompt, raw.userPrompt, raw.user_prompt) || undefined,
        toolName: firstString(raw.toolName, raw.tool_name, raw.name) || undefined,
        toolInput,
        toolOutput: toolOutput || undefined,
        stopReason: firstString(raw.stopReason, raw.stop_reason, raw.reason) || undefined,
        lastAssistantMessage: firstString(raw.last_assistant_message, raw.lastAssistantMessage, raw.assistantMessage, raw.message) || undefined,
        isFirstPrompt: Boolean(raw.isFirstPrompt ?? raw.is_first_prompt ?? raw.firstPrompt),
        agentName: firstString(raw.agentName, raw.agent_name, raw.agent, raw.subagent_type, raw.subagentType, process.env.GROK_AGENT_NAME, process.env.OMG_AGENT_ROLE) || undefined,
    };
}
export async function readStdinJson() {
    const chunks = [];
    for await (const chunk of process.stdin) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const text = Buffer.concat(chunks).toString("utf8").trim();
    if (!text)
        return {};
    try {
        return JSON.parse(text);
    }
    catch {
        return { _parseError: true, _raw: text.slice(0, 500) };
    }
}
export function emit(output, exitCode = 0) {
    if (output !== undefined && output !== null) {
        const s = typeof output === "string" ? output : JSON.stringify(output);
        process.stdout.write(s.endsWith("\n") ? s : s + "\n");
    }
    process.exit(exitCode);
}
//# sourceMappingURL=parse.js.map