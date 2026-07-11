#!/usr/bin/env node
/**
 * oh-my-grok hook entry — fail-open shell around all events.
 * Usage: node dist/cli.js <event>
 */
import { emit, parseHookInput, readEnvConfig, readStdinJson, } from "./protocol/parse.js";
import { handlePostToolRead, handlePostToolShell, handlePostToolSpawn, handlePostToolTodo, handlePostToolWrite, } from "./events/post-tool.js";
import { handlePreToolUse } from "./events/pre-tool-use.js";
import { handleSessionEnd } from "./events/session-end.js";
import { handleSessionStart } from "./events/session-start.js";
import { handleStop } from "./events/stop.js";
import { handleUserPrompt } from "./events/user-prompt.js";
const EVENTS = new Set([
    "session-start",
    "user-prompt",
    "pre-tool-use",
    "post-tool-read",
    "post-tool-todo",
    "post-tool-write",
    "post-tool-shell",
    "post-tool-spawn",
    "stop",
    "session-end",
]);
async function main() {
    const eventArg = (process.argv[2] || "").toLowerCase();
    if (!EVENTS.has(eventArg)) {
        console.error(`[oh-my-grok] unknown event: ${eventArg}`);
        emit({}, 0);
    }
    const event = eventArg;
    try {
        const raw = await readStdinJson();
        const input = parseHookInput(event, raw);
        const cfg = readEnvConfig(input.workspaceRoot);
        switch (event) {
            case "session-start":
                emit(handleSessionStart(input, cfg), 0);
                break;
            case "user-prompt":
                emit(handleUserPrompt(input, cfg), 0);
                break;
            case "pre-tool-use": {
                const r = handlePreToolUse(input, cfg);
                emit(r.output, r.exitCode);
                break;
            }
            case "post-tool-read":
                emit(handlePostToolRead(input, cfg), 0);
                break;
            case "post-tool-todo":
                emit(handlePostToolTodo(input, cfg), 0);
                break;
            case "post-tool-write":
                emit(handlePostToolWrite(input, cfg), 0);
                break;
            case "post-tool-shell":
                emit(handlePostToolShell(input, cfg), 0);
                break;
            case "post-tool-spawn":
                emit(handlePostToolSpawn(input, cfg), 0);
                break;
            case "stop":
                emit(handleStop(input, cfg), 0);
                break;
            case "session-end":
                emit(handleSessionEnd(input, cfg), 0);
                break;
            default:
                emit({}, 0);
        }
    }
    catch (err) {
        console.error("[oh-my-grok] fail-open:", err);
        if (eventArg === "pre-tool-use")
            emit({ decision: "allow" }, 0);
        else
            emit({}, 0);
    }
}
main();
//# sourceMappingURL=cli.js.map