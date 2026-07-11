export function detectIntent(prompt) {
    const p = prompt.toLowerCase();
    if (/\bultrawork\b|\bulw\b|\/ulw/.test(p))
        return "ultrawork";
    if (/\bhyperplan\b|\/hyperplan/.test(p))
        return "hyperplan";
    if (/\b(search|find|where is|grep|locate)\b/.test(p))
        return "search";
    if (/\b(analyze|investigate|root cause|why)\b/.test(p))
        return "analyze";
    if (/\b(debug|fix|bug|error|failing)\b/.test(p))
        return "debug";
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