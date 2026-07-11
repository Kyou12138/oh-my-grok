/** Hard orchestration protocol (Sisyphus) — injected every prompt when enabled. */
export function hardOrchestrationBanner() {
    return [
        "<OMG_HARD_ORCHESTRATION>",
        "Sisyphus HARD protocol (non-optional for multi-step work):",
        "",
        "1) CLASSIFY: research | implement | fix | plan | review",
        "2) DELEGATE when useful via spawn_subagent:",
        "   - explore  → locate files/symbols (read-only)",
        "   - oracle   → architecture / hard debug strategy (read-only)",
        "   - librarian→ external docs / APIs",
        "   - hephaestus → deep multi-file implementation",
        "   - plan/prometheus → /plan before large features",
        "3) SKILLS: Read matching SKILL.md before mutating (Skill Gate).",
        "4) EDIT: Hashline — Read file first; no stale old_string.",
        "5) VERIFY: tests/typecheck; <promise>VERIFIED</promise> before done claims.",
        "6) LOOPS: /ralph-loop or ultrawork for long tasks; <promise>DONE</promise> only when complete.",
        "7) Never stop with unfinished todos/boulder/ralph active.",
        "",
        "Single-line typo fixes may skip delegation. Everything else: follow the protocol.",
        "</OMG_HARD_ORCHESTRATION>",
    ].join("\n");
}
export function commentCheckerHint() {
    return [
        "<OMG_COMMENT_CHECKER>",
        "Avoid AI-slop comments: no \"// This function does X\" restating the code,",
        "no emoji decorations, no obvious narration. Comment only non-obvious intent/constraints.",
        "</OMG_COMMENT_CHECKER>",
    ].join("\n");
}
//# sourceMappingURL=orchestration.js.map