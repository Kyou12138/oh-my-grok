/**
 * Sticky session agent role for Agent Guard when host omits agentName on later tools.
 */
import path from "node:path";
import { ensureDir, readJson, removeFile, writeJsonAtomic } from "../state/fs.js";
import { pathsFor } from "../state/paths.js";
function fileFor(input, cfg) {
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    return path.join(p.session, "session-role.json");
}
export function loadSessionAgentRoleState(input, cfg) {
    return readJson(fileFor(input, cfg), null);
}
export function getSessionAgentRole(input, cfg) {
    const st = loadSessionAgentRoleState(input, cfg);
    return (st?.role || "").toLowerCase();
}
export function setSessionAgentRole(input, cfg, role, source = "manual") {
    const r = role.trim().toLowerCase();
    if (!r)
        return;
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    ensureDir(p.session);
    writeJsonAtomic(fileFor(input, cfg), {
        schemaVersion: 1,
        role: r,
        source,
        updatedAt: new Date().toISOString(),
    });
}
export function clearSessionAgentRole(input, cfg) {
    removeFile(fileFor(input, cfg));
}
/** Extract role from spawn/task tool input. */
export function extractSpawnRole(toolInput) {
    if (!toolInput)
        return "";
    const raw = String(toolInput.subagent_type ??
        toolInput.subagentType ??
        toolInput.agent ??
        toolInput.agent_type ??
        toolInput.agentType ??
        toolInput.type ??
        "").trim();
    if (!raw)
        return "";
    let role = raw.toLowerCase();
    if (role.includes(":"))
        role = role.split(":").pop() || role;
    if (role.startsWith("oh-my-grok-"))
        role = role.replace(/^oh-my-grok-/, "");
    return role;
}
export function isSpawnTool(toolName) {
    if (!toolName)
        return false;
    // Letters-only (v1.1.7): SpawnSubagent / spawn-subagent same as spawn_subagent
    const n = toolName.toLowerCase().replace(/[^a-z]/g, "");
    return (n.includes("spawn") ||
        n === "task" ||
        n.includes("callomo") ||
        n === "subagent");
}
/** /agent <name> or /as <name> */
export function detectAgentCommand(prompt) {
    const m = prompt.trim().match(/^\/agent(?:-role)?\s+(\S+)/i) ||
        prompt.trim().match(/^\/as\s+(\S+)/i);
    if (!m)
        return null;
    return { role: m[1].toLowerCase() };
}
//# sourceMappingURL=session-role.js.map