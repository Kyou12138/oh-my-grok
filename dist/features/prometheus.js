import fs from "node:fs";
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
    writeTextAtomic(planFile, [
        `# Plan: ${topic}`,
        "",
        "## Goal",
        "",
        topic,
        "",
        "## Open questions",
        "",
        "- [ ] ",
        "",
        "## Steps",
        "",
        "- [ ] ",
        "",
        "## Success criteria",
        "",
        "- [ ] ",
        "",
        "## Review",
        "",
        "Required before `/start-work` (check at least one):",
        "",
        "- [ ] Metis gap analysis completed",
        "- [ ] Momus VERDICT: PASS (or note residual blockers)",
        "",
    ].join("\n"));
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
/**
 * Plan must show Metis/Momus/review evidence before boulder execution.
 * Accepts ## Review with a checked item, or explicit Metis/Momus/VERDICT markers.
 */
export function planFileHasReview(planPath) {
    if (!planPath || !fs.existsSync(planPath))
        return false;
    let text = "";
    try {
        text = fs.readFileSync(planPath, "utf8");
    }
    catch {
        return false;
    }
    if (/VERDICT:\s*PASS/i.test(text))
        return true;
    if (/Momus.*PASS|PASS.*Momus/i.test(text))
        return true;
    // Checked review bullets under Review or anywhere
    if (/##\s*Review[\s\S]*?- \[x\]/i.test(text))
        return true;
    if (/- \[x\].*(Metis|Momus|review)/i.test(text))
        return true;
    if (/\bMetis\b[\s\S]{0,200}\b(done|completed|完成|已)/i.test(text))
        return true;
    return false;
}
export function planReviewDenyReason(planPath) {
    return [
        "[PLAN_REVIEW] /start-work blocked — plan lacks review evidence.",
        planPath ? `Plan: ${planPath}` : "No active plan file.",
        "",
        "Before executing, complete the review chain:",
        "1) Spawn **metis** (read-only) — gaps / ambiguities",
        "2) Spawn **momus** (read-only) — VERDICT: PASS|FAIL",
        "3) In the plan markdown under ## Review, check items or write VERDICT: PASS",
        "4) Re-run /start-work",
    ].join("\n");
}
export function startWorkFromPlan(input, cfg) {
    const pm = loadPlanMode(input, cfg);
    const planPath = pm.planFile || "";
    if (!planPath) {
        return {
            ok: false,
            planPath: "",
            reason: "[PLAN_REVIEW] No active plan. Run /plan first.",
        };
    }
    if (!planFileHasReview(planPath)) {
        return { ok: false, planPath, reason: planReviewDenyReason(planPath) };
    }
    setBoulder(input, cfg, {
        schemaVersion: 1,
        active: true,
        planPath,
        title: pm.topic || "start-work",
        notes: "Activated via /start-work (Atlas/Sisyphus execution) after plan review.",
        updatedAt: new Date().toISOString(),
    });
    endPlanMode(input, cfg);
    return { ok: true, planPath };
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
        "",
        "Review chain (before /start-work):",
        "1) **Metis** (plan consultant) — spawn read-only: find hidden intent, ambiguities, AI failure points.",
        "2) **Momus** (plan reviewer) — spawn read-only: validate clarity, verifiability, completeness.",
        "3) Fold review feedback into the plan markdown checkboxes.",
        "4) User runs /start-work → Atlas/boulder execution.",
        "When plan is approved, user runs /start-work to enter boulder execution.",
        "</OMG_PROMETHEUS>",
    ]
        .filter(Boolean)
        .join("\n");
}
//# sourceMappingURL=prometheus.js.map