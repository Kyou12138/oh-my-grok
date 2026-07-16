import fs from "node:fs";
import path from "node:path";
const MAX_CHARS = 12_000;
/** Truncate at code-point boundary (CJK/emoji safe). */
export function truncateRulesText(str, max) {
    if (str.length <= max && /^[\x00-\x7F]*$/.test(str))
        return str;
    if (/^[\x00-\x7F]*$/.test(str))
        return str.slice(0, max);
    const cps = Array.from(str);
    if (cps.length <= max)
        return str;
    return cps.slice(0, max).join("");
}
/** Read plugin version from package.json (fingerprint / alive banner). */
export function readPluginVersion(pluginRoot) {
    try {
        const raw = fs.readFileSync(path.join(pluginRoot, "package.json"), "utf8");
        const v = JSON.parse(raw)?.version;
        if (typeof v === "string" && v.trim())
            return v.trim();
    }
    catch {
        /* ignore */
    }
    return "0.0.0";
}
export function loadInjectedRules(workspaceRoot, cfg) {
    const parts = [];
    // Workspace AGENTS.md (prefer AGENTS.md over agents.md / CLAUDE.md)
    for (const name of ["AGENTS.md", "agents.md", "CLAUDE.md"]) {
        const f = path.join(workspaceRoot, name);
        if (fs.existsSync(f)) {
            try {
                parts.push(`## ${name}\n` + fs.readFileSync(f, "utf8"));
            }
            catch {
                /* ignore */
            }
            break;
        }
    }
    // Plugin rules
    const rulesDir = path.join(cfg.pluginRoot, "rules");
    if (fs.existsSync(rulesDir)) {
        const files = fs
            .readdirSync(rulesDir)
            .filter((f) => f.endsWith(".md"))
            .sort();
        for (const f of files) {
            try {
                parts.push(`## rules/${f}\n` + fs.readFileSync(path.join(rulesDir, f), "utf8"));
            }
            catch {
                /* ignore */
            }
        }
    }
    let text = parts.join("\n\n");
    if (Array.from(text).length > MAX_CHARS) {
        text = truncateRulesText(text, MAX_CHARS) + "\n\n…[truncated for size]";
    }
    if (!text)
        return "";
    return `<OMG_RULES>\n${text}\n</OMG_RULES>`;
}
export function sisyphusBootstrap() {
    return [
        "<OMG_SISYPHUS>",
        "You are operating under oh-my-grok Discipline Agents (omo-inspired).",
        "",
        "Default persona: **Sisyphus** — orchestrator. Prefer plan → delegate → verify → finish.",
        "Specialists via host **`task`** (or `spawn_subagent` where available):",
        "- explore — fast codebase search (read-only)",
        "- oracle — architecture & hard debugging (read-only consultant)",
        "- librarian — docs / external research (read-only)",
        "- metis — plan consultant: gaps & ambiguities (read-only)",
        "- momus — plan reviewer: clarity/verifiability (read-only)",
        "- prometheus — strategic planning interviews (use /plan or enter_plan_mode)",
        "- hephaestus — deep autonomous implementation",
        "- atlas — execute plans after /start-work (boulder)",
        "",
        "After background work: **`get_task_output`** (or wait_tasks) then integrate findings — do not stop on spawn-announce alone.",
        "Categories (thin layer): visual-engineering | ultrabrain | deep | quick | writing | unspecified-* — pick matching specialist when useful.",
        "Methodology: Superpowers skills (brainstorming → writing-plans → TDD → verification).",
        "Before creative work: Read using-superpowers / brainstorming SKILL.md when applicable.",
        "Loops: /ralph-loop, /ulw-loop (ultrawork), /cancel-ralph, /handoff, /plan, /start-work,",
        "/init-deep, /stop-continuation, /resume-continuation.",
        "</OMG_SISYPHUS>",
    ].join("\n");
}
export function usingSuperpowersHint(pluginRoot) {
    const skill = path.join(pluginRoot, "vendor", "superpowers", "skills", "using-superpowers", "SKILL.md");
    const local = path.join(pluginRoot, "skills", "using-superpowers", "SKILL.md");
    const target = fs.existsSync(skill) ? skill : local;
    return [
        "<OMG_USING_SUPERPOWERS>",
        "Superpowers methodology is active via oh-my-grok.",
        `Read skill when starting non-trivial work: ${target}`,
        "Flow: brainstorming → design approval → writing-plans → TDD implementation → verification-before-completion.",
        "Do not skip to coding on ambiguous requests.",
        "</OMG_USING_SUPERPOWERS>",
    ].join("\n");
}
//# sourceMappingURL=rules.js.map