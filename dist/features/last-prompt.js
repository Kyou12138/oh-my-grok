import { ensureDir, readJson, writeJsonAtomic } from "../state/fs.js";
import { pathsFor } from "../state/paths.js";
import { loadRalph } from "./ralph.js";
import { pathsFromToolInput } from "./tool-paths.js";
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
/**
 * Paths that imply test intent (safe to include in skill-gate context).
 * Other paths must NOT enter context — e.g. `plan_executor.ts` / `my-plan.md`
 * falsely triggered writing-plans (v1.1.16).
 */
export function isTestLikePath(filePath) {
    if (!filePath?.trim())
        return false;
    const n = filePath.replace(/\\/g, "/");
    return (/\.(test|spec)\.[a-z0-9]+$/i.test(n) ||
        /\/__tests__\//i.test(n) ||
        /\/tests?\//i.test(n) ||
        /\/spec\//i.test(n));
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
    // Only test-like paths contribute path intent (TDD/verification skills)
    // v1.1.23: MultiEdit may touch several test files
    for (const file of pathsFromToolInput(input.toolInput)) {
        if (isTestLikePath(file))
            parts.push(file);
    }
    return parts.join("\n");
}
//# sourceMappingURL=last-prompt.js.map