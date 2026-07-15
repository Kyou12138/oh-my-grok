/**
 * Thin category layer — route work style without multi-model matrix.
 * Aligns with omo categories at the prompt/delegation level.
 */
export function detectCategory(prompt) {
    const p = prompt.toLowerCase();
    if (!p.trim())
        return null;
    // CJK: do NOT use \b — JS word boundaries only apply to [A-Za-z0-9_], so pure Chinese never matched.
    if (/\b(ui|ux|css|tailwind|frontend|front-end|dashboard|layout|animation|responsive|design system|stylesheet|component style)\b/.test(p) ||
        /(按钮|界面|样式|动画|前端)/.test(prompt)) {
        return "visual-engineering";
    }
    // deep before ultrabrain so "deep dive … architecture" classifies as deep work
    if (/\b(deep dive|deep research|end-to-end|autonomous|hairy|complex refactor)\b/.test(p) ||
        /(深入|端到端|自治实现)/.test(prompt)) {
        return "deep";
    }
    if (/\b(architecture|trade-?off|design decision|system design|ultrabrain|hard logic)\b/.test(p) ||
        /(架构|权衡|系统设计)/.test(prompt)) {
        return "ultrabrain";
    }
    if (/\b(creative|artistry|novel idea|brand|aesthetic)\b/.test(p) || /(创意|美学)/.test(prompt)) {
        return "artistry";
    }
    if (/\b(typo|rename|one-?liner|trivial|simple fix|quick fix|nit)\b/.test(p) ||
        /(笔误|错别字|小改|快速修)/.test(prompt)) {
        return "quick";
    }
    if (/\b(readme|docs?|documentation|prose|changelog|blog)\b/.test(p) ||
        /(文档|说明|撰写)/.test(prompt)) {
        return "writing";
    }
    // Mild edits — was dead ADVICE entry (unspecified-low never returned)
    if (/\b(tweak|adjust|touch\s*up|polish|slight(?:ly)?)\b/.test(p) ||
        /(微调|调整|润色)/.test(prompt)) {
        return "unspecified-low";
    }
    if (/\b(implement|feature|refactor|migrate|ship)\b/.test(p) ||
        /(实现|重构|迁移)/.test(prompt)) {
        return "unspecified-high";
    }
    return null;
}
const ADVICE = {
    "visual-engineering": "Prefer strong visual craft. Consider playwright/browser verify. Delegate UI polish if needed.",
    ultrabrain: "Spawn **oracle** (read-only) for architecture consult before coding. Evidence over vibes.",
    deep: "Spawn **hephaestus** for goal-oriented multi-file work. One goal + one deliverable per deep pass.",
    artistry: "Push distinctive aesthetics; avoid generic AI UI (Inter/purple gradients).",
    quick: "Minimal scope. Single-file if possible. Skip heavy planning.",
    writing: "Match project voice. Prefer short clear prose; avoid AI filler.",
    "unspecified-high": "Non-trivial: plan briefly → TDD → verify. Use todos. Consider /plan if multi-day.",
    "unspecified-low": "Keep changes small and verified.",
};
export function categoryBanner(cat) {
    if (!cat)
        return "";
    return [
        `<OMG_CATEGORY name="${cat}">`,
        `Work category: **${cat}**`,
        ADVICE[cat],
        "Categories are harness guidance (not multi-model routing). Pick the matching subagent when useful.",
        "</OMG_CATEGORY>",
    ].join("\n");
}
//# sourceMappingURL=category.js.map