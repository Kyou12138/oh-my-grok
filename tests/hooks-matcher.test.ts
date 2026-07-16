/**
 * hooks.json matcher ↔ isMutatingTool / isSpawnTool single-source guard (v1.1.26+).
 * Prevents "new tool name in hooks but not MUTATING" and the reverse for PreTool surface.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  isMutatingTool,
  MUTATING_TOOL_IDS,
  normalizeToolName,
} from "../src/features/skill-gate.js";
import { isSpawnTool } from "../src/features/session-role.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadHooks(): {
  PreToolUse?: { matcher?: string }[];
  PostToolUse?: { matcher?: string }[];
} {
  const raw = JSON.parse(
    fs.readFileSync(path.join(root, "hooks", "hooks.json"), "utf8"),
  );
  return raw.hooks || {};
}

function splitMatcher(m?: string): string[] {
  if (!m) return [];
  return m.split("|").map((s) => s.trim()).filter(Boolean);
}

describe("hooks.json PreTool matcher coverage", () => {
  const hooks = loadHooks();
  const preNames = splitMatcher(hooks.PreToolUse?.[0]?.matcher);

  it("PreTool matcher is non-empty", () => {
    expect(preNames.length).toBeGreaterThan(10);
  });

  it("every PreTool matcher name is mutating OR spawn (agent-guard surface)", () => {
    for (const name of preNames) {
      const ok = isMutatingTool(name) || isSpawnTool(name);
      expect(ok, `PreTool matcher "${name}" not covered by isMutatingTool|isSpawnTool`).toBe(
        true,
      );
    }
  });

  it("every MUTATING_TOOL_IDS has at least one PreTool matcher alias", () => {
    const covered = new Set(preNames.map((n) => normalizeToolName(n)));
    for (const id of MUTATING_TOOL_IDS) {
      expect(
        covered.has(id),
        `MUTATING id "${id}" has no alias in PreTool matcher`,
      ).toBe(true);
    }
  });
});

describe("hooks.json PostTool write matcher", () => {
  const hooks = loadHooks();
  // write hook is third PostToolUse entry (Read, Todo, Write, …) — find by cli path
  const writeEntry = (hooks.PostToolUse || []).find((e) =>
    JSON.stringify(e).includes("post-tool-write"),
  );
  // matcher is sibling of hooks array on same object
  const all = hooks.PostToolUse || [];
  let writeMatcher = "";
  for (const e of all as { matcher?: string; hooks?: { command?: string }[] }[]) {
    const cmd = e.hooks?.[0]?.command || "";
    if (cmd.includes("post-tool-write")) {
      writeMatcher = e.matcher || "";
      break;
    }
  }
  const names = splitMatcher(writeMatcher);

  it("includes NotebookEdit / MultiEdit / CreateFile aliases", () => {
    expect(names.some((n) => /notebook|Notebook/i.test(n))).toBe(true);
    expect(names.some((n) => /MultiEdit|Multiedit/i.test(n))).toBe(true);
    expect(names.some((n) => /CreateFile|Create/i.test(n))).toBe(true);
  });

  it("includes snake_case write aliases (v1.1.28)", () => {
    expect(names).toEqual(expect.arrayContaining(["write_file", "create_file", "delete_file"]));
    expect(preNamesHasSnake()).toBe(true);
  });

  it("every write matcher name is mutating", () => {
    for (const name of names) {
      expect(isMutatingTool(name), `PostTool write "${name}"`).toBe(true);
    }
  });
});

function preNamesHasSnake(): boolean {
  const hooks = loadHooks();
  const pre = splitMatcher(hooks.PreToolUse?.[0]?.matcher);
  return (
    pre.includes("write_file") &&
    pre.includes("create_file") &&
    pre.includes("delete_file")
  );
}
