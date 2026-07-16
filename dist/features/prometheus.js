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
        "Required before `/start-work` — check items only after real Metis/Momus review:",
        "",
        "- [ ] Metis gap analysis (spawn metis first)",
        "- [ ] Momus plan review (spawn momus; then record result below)",
        "",
        "After real review: check the boxes above, or append a Momus result line that starts with VERDICT followed by colon and PASS.",
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
 * Host enter_plan_mode tool — arm plan-mode gate without forcing a new plan file.
 * If already active, keep existing planFile/topic.
 */
export function activateHostPlanMode(input, cfg, topic = "enter_plan_mode") {
    const existing = loadPlanMode(input, cfg);
    if (existing.active) {
        return existing;
    }
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    ensureDir(p.plansDir);
    const state = {
        schemaVersion: 1,
        active: true,
        topic: topic.slice(0, 80) || "enter_plan_mode",
        planFile: existing.planFile,
        updatedAt: new Date().toISOString(),
    };
    writeJsonAtomic(p.planMode, state);
    return state;
}
/** Normalize host plan tool names (enter_plan_mode / exit_plan_mode / CamelCase). */
export function isHostEnterPlanTool(toolName) {
    if (!toolName)
        return false;
    const n = toolName.toLowerCase().replace(/[^a-z]/g, "");
    return n === "enterplanmode" || n.includes("enterplanmode");
}
export function isHostExitPlanTool(toolName) {
    if (!toolName)
        return false;
    const n = toolName.toLowerCase().replace(/[^a-z]/g, "");
    return n === "exitplanmode" || n.includes("exitplanmode");
}
/**
 * Plan must show real review evidence before boulder execution.
 * Only checked markdown items or VERDICT:PASS on a non-unchecked line count.
 * Unchecked template prose (e.g. "- [ ] Momus … VERDICT") must NOT pass.
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
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
        const t = line.trim();
        // Unchecked checklist — never evidence (even if it mentions Metis/VERDICT).
        // GFM list markers: - * + (align hasOpenPlanCheckboxes).
        if (/^[-*+]\s*\[\s*\]/.test(t))
            continue;
        // Checked item about review / Metis / Momus
        if (/^[-*+]\s*\[x\]/i.test(t) &&
            /(metis|momus|review|评审|verdict)/i.test(t)) {
            return true;
        }
        // Explicit Momus-style result line only (not instructional prose)
        if (/^VERDICT:\s*PASS\b/i.test(t) || /^\*\*VERDICT:\s*PASS\b/i.test(t)) {
            return true;
        }
    }
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