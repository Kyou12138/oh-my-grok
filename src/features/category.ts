/**
 * Thin category layer — route work style without multi-model matrix.
 * Aligns with omo categories at the prompt/delegation level.
 */

export type WorkCategory =
  | "visual-engineering"
  | "ultrabrain"
  | "deep"
  | "artistry"
  | "quick"
  | "writing"
  | "unspecified-high"
  | "unspecified-low"
  | null;

export function detectCategory(prompt: string): WorkCategory {
  const p = prompt.toLowerCase();
  if (!p.trim()) return null;

  if (
    /\b(ui|ux|css|tailwind|frontend|front-end|dashboard|layout|animation|responsive|design system|stylesheet|component style)\b/.test(
      p,
    ) ||
    /\b(按钮|界面|样式|动画|前端)\b/.test(p)
  ) {
    return "visual-engineering";
  }
  // deep before ultrabrain so "deep dive … architecture" classifies as deep work
  if (
    /\b(deep dive|deep research|end-to-end|autonomous|hairy|complex refactor)\b/.test(p) ||
    /\b(深入|端到端|自治实现)\b/.test(p)
  ) {
    return "deep";
  }
  if (
    /\b(architecture|trade-?off|design decision|system design|ultrabrain|hard logic)\b/.test(p) ||
    /\b(架构|权衡|系统设计)\b/.test(p)
  ) {
    return "ultrabrain";
  }
  if (/\b(creative|artistry|novel idea|brand|aesthetic)\b/.test(p) || /\b(创意|美学)\b/.test(p)) {
    return "artistry";
  }
  if (
    /\b(typo|rename|one-?liner|trivial|simple fix|quick fix|nit)\b/.test(p) ||
    /\b(笔误|错别字|小改|快速修)\b/.test(p)
  ) {
    return "quick";
  }
  if (
    /\b(readme|docs?|documentation|prose|changelog|blog)\b/.test(p) ||
    /\b(文档|说明|撰写)\b/.test(p)
  ) {
    return "writing";
  }
  if (/\b(implement|feature|refactor|migrate|ship)\b/.test(p) || /\b(实现|重构|迁移)\b/.test(p)) {
    return "unspecified-high";
  }
  return null;
}

const ADVICE: Record<Exclude<WorkCategory, null>, string> = {
  "visual-engineering":
    "Prefer strong visual craft. Consider playwright/browser verify. Delegate UI polish if needed.",
  ultrabrain:
    "Spawn **oracle** (read-only) for architecture consult before coding. Evidence over vibes.",
  deep: "Spawn **hephaestus** for goal-oriented multi-file work. One goal + one deliverable per deep pass.",
  artistry: "Push distinctive aesthetics; avoid generic AI UI (Inter/purple gradients).",
  quick: "Minimal scope. Single-file if possible. Skip heavy planning.",
  writing: "Match project voice. Prefer short clear prose; avoid AI filler.",
  "unspecified-high":
    "Non-trivial: plan briefly → TDD → verify. Use todos. Consider /plan if multi-day.",
  "unspecified-low": "Keep changes small and verified.",
};

export function categoryBanner(cat: WorkCategory): string {
  if (!cat) return "";
  return [
    `<OMG_CATEGORY name="${cat}">`,
    `Work category: **${cat}**`,
    ADVICE[cat],
    "Categories are harness guidance (not multi-model routing). Pick the matching subagent when useful.",
    "</OMG_CATEGORY>",
  ].join("\n");
}
