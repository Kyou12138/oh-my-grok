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

const MUTATING = new Set([
  "write",
  "strreplace",
  "editnotebook",
  "delete",
  "edit",
  "create",
  "apply_patch",
  "multiedit",
]);

export function isMutatingTool(name?: string): boolean {
  if (!name) return false;
  return MUTATING.has(name.toLowerCase().replace(/[^a-z_]/g, ""));
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

export function skillGateDenyReason(state: SkillGateState): string | null {
  if (state.catalog.length === 0) return null;
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

export function skillGateReminder(state: SkillGateState): string {
  if (state.catalog.length === 0) return "";
  const unloaded = state.catalog.filter((c) => !state.loaded.includes(c.id));
  if (unloaded.length === 0) {
    return `<OMG_SKILL_GATE>Loaded skills: ${state.loaded.join(", ") || "(none)"}</OMG_SKILL_GATE>`;
  }
  return [
    "<OMG_SKILL_GATE>",
    "Before mutating files, Read a relevant SKILL.md (superpowers or oh-my-grok).",
    `Loaded: ${state.loaded.join(", ") || "(none)"}`,
    `Unloaded examples: ${unloaded
      .slice(0, 6)
      .map((u) => u.name)
      .join(", ")}`,
    "</OMG_SKILL_GATE>",
  ].join("\n");
}
