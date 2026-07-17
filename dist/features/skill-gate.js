import fs from "node:fs";
import path from "node:path";
import { listFilesRecursive, readJson, writeJsonAtomic } from "../state/fs.js";
import { pathsFor } from "../state/paths.js";
/**
 * Mutating tool ids — normalized to [a-z] only (drop _ - .).
 * Fixes v1.1.5: SearchReplace → searchreplace was missing while
 * search_replace (underscore kept under old [^a-z_] norm) hit the set.
 */
/**
 * Canonical mutating tool ids after normalizeToolName ([a-z] only).
 * Keep in sync with hooks.json PreTool/PostTool write matchers — see tests/hooks-matcher.test.ts.
 */
export const MUTATING_TOOL_IDS = [
    "write",
    "writefile",
    "writetofile", // WriteToFile / write_to_file
    "strreplace",
    "searchreplace",
    "strreplaceeditor",
    "replaceinfile", // ReplaceInFile / replace_in_file
    "replacestringinfile",
    "editnotebook",
    "notebookedit", // Grok / Claude NotebookEdit CamelCase → notebookedit
    "delete",
    "deletefile",
    "deletepath",
    "removefile",
    "rmfile",
    "edit",
    "editfile",
    "fileedit",
    "create",
    "createfile",
    "createorupdatefile",
    "overwritefile",
    "savefile",
    "updatefile",
    "patchfile",
    "insert",
    "insertfile",
    "append",
    "appendfile",
    "applypatch",
    "multiedit",
];
const MUTATING = new Set(MUTATING_TOOL_IDS);
/** Normalize tool name for mutating / matcher checks. */
export function normalizeToolName(name) {
    return name.toLowerCase().replace(/[^a-z]/g, "");
}
export function isMutatingTool(name) {
    if (!name)
        return false;
    return MUTATING.has(normalizeToolName(name));
}
function parseSkillFrontmatter(content, filePath) {
    const base = path.basename(path.dirname(filePath));
    let name = base;
    let description = "";
    const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (fm) {
        const nameM = fm[1].match(/^name:\s*["']?(.+?)["']?\s*$/m);
        const descM = fm[1].match(/^description:\s*["']?(.+?)["']?\s*$/m);
        if (nameM)
            name = nameM[1].trim();
        if (descM)
            description = descM[1].trim();
    }
    return { id: name, name, path: filePath, description };
}
export function scanSkillCatalog(pluginRoot) {
    const roots = [
        path.join(pluginRoot, "skills"),
        path.join(pluginRoot, "vendor", "superpowers", "skills"),
    ];
    const catalog = [];
    const seen = new Set();
    for (const root of roots) {
        for (const file of listFilesRecursive(root, (n) => n === "SKILL.md")) {
            try {
                const content = fs.readFileSync(file, "utf8");
                const meta = parseSkillFrontmatter(content, file);
                if (seen.has(meta.id))
                    continue;
                seen.add(meta.id);
                catalog.push(meta);
            }
            catch {
                /* skip */
            }
        }
    }
    return catalog;
}
export function loadSkillGateState(input, cfg) {
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    return readJson(p.skillGate, {
        schemaVersion: 1,
        loaded: [],
        catalog: [],
        updatedAt: new Date().toISOString(),
    });
}
export function saveSkillGateState(input, cfg, state) {
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    state.updatedAt = new Date().toISOString();
    writeJsonAtomic(p.skillGate, state);
}
export function refreshCatalog(input, cfg) {
    const state = loadSkillGateState(input, cfg);
    state.catalog = scanSkillCatalog(cfg.pluginRoot);
    saveSkillGateState(input, cfg, state);
    return state;
}
/** Host Skill / load_skill tool names (letters-only). v1.1.43 */
export function isSkillLoadTool(toolName) {
    if (!toolName)
        return false;
    const n = normalizeToolName(toolName);
    return (n === "skill" ||
        n === "loadskill" ||
        n === "skillload" ||
        n === "useskill" ||
        n === "runskill" ||
        n === "invokeskill" ||
        n === "skilltool" ||
        n === "activateskill");
}
/** Register a catalog skill id/name as loaded (idempotent). */
export function markSkillLoadedById(input, cfg, skillId) {
    const state = loadSkillGateState(input, cfg);
    const id = (skillId || "").trim();
    if (!id)
        return state;
    const hit = state.catalog.find((c) => c.id.toLowerCase() === id.toLowerCase() ||
        c.name.toLowerCase() === id.toLowerCase());
    if (!hit)
        return state;
    if (!state.loaded.includes(hit.id)) {
        state.loaded.push(hit.id);
        saveSkillGateState(input, cfg, state);
    }
    return state;
}
/**
 * Skill tool / Skill.md path → mark gate unlocked.
 * Hosts may load skills without Read(SKILL.md); without this, Skill Gate hard-denies forever.
 */
export function markSkillFromToolCall(input, cfg) {
    let state = loadSkillGateState(input, cfg);
    if (!state.catalog.length)
        state = refreshCatalog(input, cfg);
    const ti = input.toolInput || {};
    const candidates = [];
    for (const k of [
        "skill",
        "skill_name",
        "skillName",
        "skill_id",
        "skillId",
        "name",
        "id",
    ]) {
        const v = ti[k];
        if (typeof v === "string" && v.trim())
            candidates.push(v.trim());
    }
    // path-like fields pointing at SKILL.md
    for (const k of ["path", "file_path", "filePath", "target_file", "skill_path", "skillPath"]) {
        const v = ti[k];
        if (typeof v === "string" && v.trim()) {
            if (/skill\.md$/i.test(v)) {
                return markSkillLoaded(input, cfg, v);
            }
            candidates.push(v.trim());
        }
    }
    for (const c of candidates) {
        // bare id or path segment that matches catalog
        const base = c.replace(/\\/g, "/").split("/").filter(Boolean).pop() || c;
        const id = base.replace(/\.md$/i, "");
        if (id.toLowerCase() === "skill")
            continue;
        markSkillLoadedById(input, cfg, id);
    }
    return loadSkillGateState(input, cfg);
}
export function markSkillLoaded(input, cfg, filePath) {
    const state = loadSkillGateState(input, cfg);
    const norm = path.normalize(filePath).toLowerCase();
    for (const s of state.catalog) {
        if (path.normalize(s.path).toLowerCase() === norm) {
            if (!state.loaded.includes(s.id))
                state.loaded.push(s.id);
        }
    }
    if (norm.endsWith("skill.md")) {
        const parts = filePath.replace(/\\/g, "/").split("/");
        const idx = parts.findIndex((x) => x.toLowerCase() === "skill.md");
        if (idx > 0) {
            const id = parts[idx - 1];
            if (id && state.catalog.some((c) => c.id === id || c.name === id)) {
                if (!state.loaded.includes(id))
                    state.loaded.push(id);
            }
        }
    }
    saveSkillGateState(input, cfg, state);
    return state;
}
/**
 * Map task/file context → suggested skill ids (plugin + superpowers).
 * Used so Skill Gate is not satisfied by reading an unrelated skill.
 */
/**
 * Intent → skill suggestions. Prefer strong phrases over bare tokens
 * (omo #3312 class: substring/keyword false positives waste PreTool denies).
 * v1.1.17: drop bare `tests?` / `plan` / `loop`.
 */
const INTENT_SKILL_RULES = [
    {
        re: /\b(tdd|test-driven|unit\s*tests?|(?:write|add|run|fix)\s+(?:the\s+)?tests?|spec\s+suite|vitest|jest|pytest)\b|\.test\.|\.spec\./i,
        skills: ["test-driven-development", "verification-before-completion"],
    },
    {
        re: /\b(debug|bug|failing|regression|stack\s*trace)\b/i,
        skills: ["systematic-debugging"],
    },
    {
        // v1.1.20: drop bare "design" (UI design tokens / design system false positives)
        re: /\b(brainstorm(?:ing)?|architect|ambiguous|system\s+design|api\s+design|design\s+(?:the|a|an|our|this|for))\b/i,
        skills: ["brainstorming", "using-superpowers"],
    },
    {
        // Avoid "I plan to…" / lone "plan"; require imperative or product names
        re: /\b(roadmap|prometheus|writing-?plans?|implementation\s+plan)\b|\b(?:draft|write|create|build|make)\s+(?:a\s+|the\s+)?plan\b|\bplan\s+(?:the|a|for|our|this|my)\b|\/plan\b/i,
        skills: ["writing-plans", "prometheus-plan"],
    },
    {
        // Drop bare "loop" (for-loop / event loop false positives)
        re: /\b(ulw|ultrawork|ralph(?:-?loop)?|ulw-?loop)\b/i,
        skills: ["ulw-loop", "ralph-loop"],
    },
    {
        // v1.1.23: drop bare "review" (code review only)
        re: /\b(code\s*review|request(?:ing)?\s+review|pr\s+review|review\s+(?:this\s+)?(?:pr|diff|code|change|pull\s*request))\b|\b(?:open|submit)\s+(?:a\s+)?pr\b/i,
        skills: ["requesting-code-review", "receiving-code-review"],
    },
    {
        re: /\b(hashline|stale\s*edit|LINE#)\b/i,
        skills: ["hashline-edit"],
    },
    {
        re: /\b(handoff|session\s*summary)\b/i,
        skills: ["handoff"],
    },
];
export function suggestedSkillsForContext(catalog, context) {
    if (!context?.trim() || !catalog.length)
        return [];
    const want = new Set();
    for (const rule of INTENT_SKILL_RULES) {
        if (rule.re.test(context)) {
            for (const id of rule.skills)
                want.add(id.toLowerCase());
        }
    }
    if (!want.size)
        return [];
    return catalog.filter((c) => want.has(c.id.toLowerCase()) || want.has(c.name.toLowerCase()));
}
export function skillGateDenyReason(state, context) {
    if (state.catalog.length === 0)
        return null;
    const suggested = context
        ? suggestedSkillsForContext(state.catalog, context)
        : [];
    // Intent-aware: when we can match skills, require at least one of those loaded
    if (suggested.length > 0) {
        const ok = suggested.some((s) => state.loaded.includes(s.id) || state.loaded.includes(s.name));
        if (ok)
            return null;
        const list = suggested
            .slice(0, 6)
            .map((s) => `- ${s.name}: ${s.path}`)
            .join("\n");
        return [
            "[oh-my-grok Skill Gate] Mutating tools blocked — load a **relevant** skill first.",
            "Context matched these skills; Read one SKILL.md before editing:",
            list,
            "Workflow: Read SKILL.md → announce \"Using <name> to <purpose>\" → then edit.",
        ].join("\n");
    }
    // Fallback: any skill unlocks (fail-open for unknown intents once one skill is loaded)
    if (state.loaded.length > 0)
        return null;
    const sample = state.catalog
        .slice(0, 8)
        .map((s) => `- ${s.name}: ${s.path}`)
        .join("\n");
    return [
        "[oh-my-grok Skill Gate] Mutating tools blocked until you Read a matching SKILL.md.",
        "Workflow: pick a skill → Read its SKILL.md → announce \"Using <name> to <purpose>\" → then edit.",
        "Catalog sample:",
        sample,
        state.catalog.length > 8 ? `… +${state.catalog.length - 8} more` : "",
    ]
        .filter(Boolean)
        .join("\n");
}
export function skillGateReminder(state, context) {
    if (state.catalog.length === 0)
        return "";
    const suggested = context
        ? suggestedSkillsForContext(state.catalog, context)
        : [];
    const unloaded = state.catalog.filter((c) => !state.loaded.includes(c.id));
    if (unloaded.length === 0 && !suggested.length) {
        return `<OMG_SKILL_GATE>Loaded skills: ${state.loaded.join(", ") || "(none)"}</OMG_SKILL_GATE>`;
    }
    return [
        "<OMG_SKILL_GATE>",
        "Before mutating files, Read a relevant SKILL.md (superpowers or oh-my-grok).",
        `Loaded: ${state.loaded.join(", ") || "(none)"}`,
        suggested.length
            ? `Suggested for this task: ${suggested.map((s) => s.name).join(", ")}`
            : "",
        `Unloaded examples: ${unloaded
            .slice(0, 6)
            .map((u) => u.name)
            .join(", ")}`,
        "</OMG_SKILL_GATE>",
    ]
        .filter(Boolean)
        .join("\n");
}
//# sourceMappingURL=skill-gate.js.map