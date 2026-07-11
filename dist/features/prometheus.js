import path from "node:path";
import { ensureDir, readJson, removeFile, writeJsonAtomic, writeTextAtomic } from "../state/fs.js";
import { pathsFor } from "../state/paths.js";
import { setBoulder } from "./todo-boulder.js";
export function loadPlanMode(input, cfg) {
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    return readJson(p.planMode, {
        schemaVersion: 1,
        active: false,
        updatedAt: "",
    });
}
export function startPlanMode(input, cfg, topic) {
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    ensureDir(p.plansDir);
    const safe = topic.slice(0, 40).replace(/[^\w\u4e00-\u9fff-]+/g, "-") || "plan";
    const planFile = path.join(p.plansDir, `${Date.now()}-${safe}.md`);
    writeTextAtomic(planFile, `# Plan: ${topic}\n\n## Goal\n\n${topic}\n\n## Open questions\n\n- [ ] \n\n## Steps\n\n- [ ] \n\n## Success criteria\n\n- [ ] \n`);
    const state = {
        schemaVersion: 1,
        active: true,
        topic,
        planFile,
        updatedAt: new Date().toISOString(),
    };
    writeJsonAtomic(p.planMode, state);
    return state;
}
export function endPlanMode(input, cfg) {
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    removeFile(p.planMode);
}
export function startWorkFromPlan(input, cfg) {
    const pm = loadPlanMode(input, cfg);
    const planPath = pm.planFile;
    setBoulder(input, cfg, {
        schemaVersion: 1,
        active: true,
        planPath,
        title: pm.topic || "start-work",
        notes: "Activated via /start-work (Atlas/Sisyphus execution).",
        updatedAt: new Date().toISOString(),
    });
    endPlanMode(input, cfg);
    return planPath || "(no plan file)";
}
export function detectPlanCommand(prompt) {
    const p = prompt.trim();
    if (/^\/start-work\b/i.test(p))
        return { action: "start-work", topic: "" };
    const m = p.match(/^\/plan(?:\s+["']?(.+?)["']?)?\s*$/i) ||
        p.match(/^\/prometheus(?:\s+["']?(.+?)["']?)?\s*$/i);
    if (m)
        return { action: "plan", topic: (m[1] || "untitled plan").trim() };
    return { action: null, topic: "" };
}
export function planModeDeny(input, cfg) {
    if (!cfg.planMode)
        return null;
    const pm = loadPlanMode(input, cfg);
    if (!pm.active)
        return null;
    const file = String(input.toolInput?.file_path ??
        input.toolInput?.path ??
        input.toolInput?.filePath ??
        input.toolInput?.target_file ??
        "");
    if (!file) {
        return "[Prometheus plan-mode] Specify a path under .omg/plans/ while planning. Other writes denied.";
    }
    const norm = file.replace(/\\/g, "/");
    if (norm.includes("/.omg/plans/") || norm.includes(".omg/plans/") || norm.endsWith("plan-mode.json")) {
        return null;
    }
    return [
        "[Prometheus plan-mode] Only writes under .omg/plans/ are allowed.",
        `Blocked path: ${file}`,
        "Finish the plan, then /start-work to execute (Atlas/boulder).",
    ].join("\n");
}
export function planModeContext(pm) {
    if (!pm.active)
        return "";
    return [
        "<OMG_PROMETHEUS>",
        "PLAN MODE active. Interview the user; refine scope; write ONLY to .omg/plans/*.md.",
        pm.topic ? `Topic: ${pm.topic}` : "",
        pm.planFile ? `Plan file: ${pm.planFile}` : "",
        "When plan is approved, user runs /start-work to enter boulder execution.",
        "</OMG_PROMETHEUS>",
    ]
        .filter(Boolean)
        .join("\n");
}
//# sourceMappingURL=prometheus.js.map