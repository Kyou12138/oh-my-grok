import path from "node:path";
import { ensureDir, writeTextAtomic } from "../state/fs.js";
import { pathsFor } from "../state/paths.js";
export function detectHandoff(prompt) {
    return /^\/handoff\b/i.test(prompt.trim());
}
export function writeHandoffStub(input, cfg, prompt) {
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    ensureDir(p.handoffsDir);
    const file = path.join(p.handoffsDir, `${Date.now()}-handoff.md`);
    const body = [
        `# Handoff — ${new Date().toISOString()}`,
        "",
        "## Session",
        `- sessionId: ${input.sessionId}`,
        `- workspace: ${input.workspaceRoot}`,
        "",
        "## Trigger",
        prompt,
        "",
        "## PHASE 0 — Context",
        "(Agent: fill current goal, constraints, branch)",
        "",
        "## PHASE 1 — Done",
        "- ",
        "",
        "## PHASE 2 — In progress",
        "- ",
        "",
        "## PHASE 3 — Next",
        "- ",
        "",
        "## PHASE 4 — Risks / open questions",
        "- ",
        "",
    ].join("\n");
    writeTextAtomic(file, body);
    return file;
}
export function handoffContext(file) {
    return [
        "<OMG_HANDOFF>",
        `Write a complete handoff into: ${file}`,
        "Fill PHASE 0–4. Next session should be able to resume without prior chat.",
        "Include key files, commands run, and unfinished todos.",
        "</OMG_HANDOFF>",
    ].join("\n");
}
//# sourceMappingURL=handoff.js.map