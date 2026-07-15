export function detectIntent(prompt) {
    if (!prompt?.trim())
        return null;
    const p = prompt.toLowerCase();
    // ulw keyword: reject ulw-stop / ulw_foo (JS \b matches before hyphen) — align detectRalph
    if (/\bultrawork\b/.test(p) ||
        /\/ulw(?:-loop)?\b/.test(p) ||
        /(^|[\s,;:，])ulw\b(?![-_])/.test(p) ||
        /^\s*ulw\b(?![-_])/.test(p)) {
        return "ultrawork";
    }
    if (/\bhyperplan\b|\/hyperplan/.test(p))
        return "hyperplan";
    // search before debug so "search for the bug" stays search
    if (/\b(search|find|where is|grep|locate)\b/.test(p) ||
        /查找|搜索|定位/.test(prompt)) {
        return "search";
    }
    // debug before analyze — fix/bug/error are actionable harness intents
    if (/\b(debug|fix|bug|error|failing)\b/.test(p) ||
        /调试|修\s*bug|报错/.test(prompt)) {
        return "debug";
    }
    if (/\b(analyze|investigate|root cause|why)\b/.test(p) ||
        /分析|根因|为何/.test(prompt)) {
        return "analyze";
    }
    if (/\b(team mode|parallel agents|spawn.*agents)\b/.test(p))
        return "team";
    return null;
}
export function intentBanner(mode) {
    if (!mode)
        return "";
    const map = {
        ultrawork: "INTENT: ultrawork — full Sisyphus mode. Explore, implement, verify; do not stop early. Prefer /ulw-loop discipline.",
        search: "INTENT: search — prefer spawn_subagent explore + librarian. Report paths and evidence before editing.",
        analyze: "INTENT: analyze — deep read-only investigation first; Oracle-style reasoning; no drive-by refactors.",
        hyperplan: "INTENT: hyperplan — multi-angle plan critique before code. Use Prometheus plan-mode (/plan).",
        team: "INTENT: team — delegate via spawn_subagent (explore, oracle, hephaestus, librarian) in parallel when possible.",
        debug: "INTENT: debug — systematic-debugging skill; reproduce → root cause → minimal fix → verify.",
    };
    return `<OMG_INTENT_GATE>\n${map[mode]}\n</OMG_INTENT_GATE>`;
}
//# sourceMappingURL=intent-gate.js.map