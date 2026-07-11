import fs from "node:fs";
import path from "node:path";
const MAX_CHARS = 12_000;
export function loadInjectedRules(workspaceRoot, cfg) {
    const parts = [];
    // Workspace AGENTS.md
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
    if (text.length > MAX_CHARS) {
        text = text.slice(0, MAX_CHARS) + "\n\n…[truncated for size]";
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
        "Default persona: **Sisyphus** — orchestrator. Plan, delegate, finish. Do not stop halfway.",
        "Specialists (spawn_subagent / agent types when available):",
        "- explore — fast codebase search (read-only)",
        "- oracle — architecture & hard debugging (read-only consultant)",
        "- librarian — docs / external research",
        "- prometheus — strategic planning interviews (use /plan)",
        "- hephaestus — deep autonomous implementation",
        "- atlas — execute plans after /start-work (boulder)",
        "",
        "Methodology: Superpowers skills (brainstorming → writing-plans → TDD → verification).",
        "Before creative work: Read using-superpowers / brainstorming SKILL.md when applicable.",
        "Loops: /ralph-loop, /ulw-loop (ultrawork), /cancel-ralph, /handoff, /plan, /start-work,",
        "/stop-continuation, /resume-continuation.",
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