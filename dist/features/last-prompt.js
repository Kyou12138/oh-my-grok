import { ensureDir, readJson, writeJsonAtomic } from "../state/fs.js";
import { pathsFor } from "../state/paths.js";
import { loadRalph } from "./ralph.js";
export function saveLastPrompt(input, cfg, prompt) {
    if (!prompt?.trim())
        return;
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    ensureDir(p.session);
    writeJsonAtomic(p.lastPrompt, {
        schemaVersion: 1,
        prompt: prompt.slice(0, 4000),
        updatedAt: new Date().toISOString(),
    });
}
export function loadLastPrompt(input, cfg) {
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    const st = readJson(p.lastPrompt, null);
    return st?.prompt || "";
}
/** Context string for intent-aware skill gate. */
export function skillGateContext(input, cfg) {
    const parts = [];
    const last = loadLastPrompt(input, cfg);
    if (last)
        parts.push(last);
    const ralph = loadRalph(input, cfg);
    if (ralph?.task)
        parts.push(ralph.task);
    const file = String(input.toolInput?.file_path ??
        input.toolInput?.path ??
        input.toolInput?.filePath ??
        input.toolInput?.target_file ??
        "");
    if (file)
        parts.push(file);
    return parts.join("\n");
}
//# sourceMappingURL=last-prompt.js.map