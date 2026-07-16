import fs from "node:fs";
import path from "node:path";
import type { EnvConfig, HookInput } from "../protocol/types.js";
import { listFilesRecursive, readJson, writeJsonAtomic } from "../state/fs.js";
import { pathsFor } from "../state/paths.js";

export interface SkillMeta {
  id: string;
  name: string;
  path: string;
  description: string;
}

export interface SkillGateState {
  schemaVersion: 1;
  loaded: string[];
  catalog: SkillMeta[];
  updatedAt: string;
}

/**
 * Mutating tool ids — normalized to [a-z] only (drop _ - .).
 * Fixes v1.1.5: SearchReplace → searchreplace was missing while
 * search_replace (underscore kept under old [^a-z_] norm) hit the set.
 */
const MUTATING = new Set([
  "write",
  "strreplace",
  "searchreplace",
  "editnotebook",
  "notebookedit", // Grok / Claude NotebookEdit CamelCase → notebookedit
  "delete",
  "deletefile",
  "edit",
  "editfile",
  "create",
  "createfile",
  "applypatch",
  "multiedit",
  "writefile",
]);

/** Normalize tool name for mutating / matcher checks. */
export function normalizeToolName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}

export function isMutatingTool(name?: string): boolean {
  if (!name) return false;
  return MUTATING.has(normalizeToolName(name));
}

function parseSkillFrontmatter(content: string, filePath: string): SkillMeta {
  const base = path.basename(path.dirname(filePath));
  let name = base;
  let description = "";
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fm) {
    const nameM = fm[1].match(/^name:\s*["']?(.+?)["']?\s*$/m);
    const descM = fm[1].match(/^description:\s*["']?(.+?)["']?\s*$/m);
    if (nameM) name = nameM[1].trim();
    if (descM) description = descM[1].trim();
  }
  return { id: name, name, path: filePath, description };
}

export function scanSkillCatalog(pluginRoot: string): SkillMeta[] {
  const roots = [
    path.join(pluginRoot, "skills"),
    path.join(pluginRoot, "vendor", "superpowers", "skills"),
  ];
  const catalog: SkillMeta[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    for (const file of listFilesRecursive(root, (n) => n === "SKILL.md")) {
      try {
        const content = fs.readFileSync(file, "utf8");
        const meta = parseSkillFrontmatter(content, file);
        if (seen.has(meta.id)) continue;
        seen.add(meta.id);
        catalog.push(meta);
      } catch {
        /* skip */
      }
    }
  }
  return catalog;
}

export function loadSkillGateState(input: HookInput, cfg: EnvConfig): SkillGateState {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  return readJson<SkillGateState>(p.skillGate, {
    schemaVersion: 1,
    loaded: [],
    catalog: [],
    updatedAt: new Date().toISOString(),
  });
}

export function saveSkillGateState(
  input: HookInput,
  cfg: EnvConfig,
  state: SkillGateState,
): void {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  state.updatedAt = new Date().toISOString();
  writeJsonAtomic(p.skillGate, state);
}

export function refreshCatalog(input: HookInput, cfg: EnvConfig): SkillGateState {
  const state = loadSkillGateState(input, cfg);
  state.catalog = scanSkillCatalog(cfg.pluginRoot);
  saveSkillGateState(input, cfg, state);
  return state;
}

export function markSkillLoaded(
  input: HookInput,
  cfg: EnvConfig,
  filePath: string,
): SkillGateState {
  const state = loadSkillGateState(input, cfg);
  const norm = path.normalize(filePath).toLowerCase();
  for (const s of state.catalog) {
    if (path.normalize(s.path).toLowerCase() === norm) {
      if (!state.loaded.includes(s.id)) state.loaded.push(s.id);
    }
  }
  if (norm.endsWith("skill.md")) {
    const parts = filePath.replace(/\\/g, "/").split("/");
    const idx = parts.findIndex((x) => x.toLowerCase() === "skill.md");
    if (idx > 0) {
      const id = parts[idx - 1];
      if (id && state.catalog.some((c) => c.id === id || c.name === id)) {
        if (!state.loaded.includes(id)) state.loaded.push(id);
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
const INTENT_SKILL_RULES: { re: RegExp; skills: string[] }[] = [
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

export function suggestedSkillsForContext(
  catalog: SkillMeta[],
  context: string,
): SkillMeta[] {
  if (!context?.trim() || !catalog.length) return [];
  const want = new Set<string>();
  for (const rule of INTENT_SKILL_RULES) {
    if (rule.re.test(context)) {
      for (const id of rule.skills) want.add(id.toLowerCase());
    }
  }
  if (!want.size) return [];
  return catalog.filter(
    (c) => want.has(c.id.toLowerCase()) || want.has(c.name.toLowerCase()),
  );
}

export function skillGateDenyReason(
  state: SkillGateState,
  context?: string,
): string | null {
  if (state.catalog.length === 0) return null;

  const suggested = context
    ? suggestedSkillsForContext(state.catalog, context)
    : [];

  // Intent-aware: when we can match skills, require at least one of those loaded
  if (suggested.length > 0) {
    const ok = suggested.some(
      (s) => state.loaded.includes(s.id) || state.loaded.includes(s.name),
    );
    if (ok) return null;
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
  if (state.loaded.length > 0) return null;
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

export function skillGateReminder(
  state: SkillGateState,
  context?: string,
): string {
  if (state.catalog.length === 0) return "";
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
