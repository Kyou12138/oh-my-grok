/**
 * Category discipline gate suite (v0.10) — unit coverage for
 * src/features/category-discipline.ts.
 *
 * testability: category-discipline.ts exports both public functions
 * (markSpawnActivity / categoryDisciplineStopReason), so this is a direct
 * pure-function suite — no E2E stdin driving required.
 *
 * state isolation: cfg.pluginData is pointed at an os.tmpdir() scratch dir
 * via tmpWorkspace(). The per-session state files (category-discipline.json
 * and last-prompt.json) live under pluginData/<sessionId>/, so pointing
 * pluginData at a fresh tmpdir fully isolates them — no real project .omg/
 * or pluginData is ever touched. We rely on saveLastPrompt() to prime the
 * prompt that categoryDisciplineStopReason reads internally via
 * loadLastPrompt(), matching the real call order from stop.ts.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  categoryDisciplinePreDeny,
  categoryDisciplineStopReason,
  markSpawnActivity,
} from "../src/features/category-discipline.js";
import { handlePreToolUse } from "../src/events/pre-tool-use.js";
import { saveLastPrompt } from "../src/features/last-prompt.js";
import type { CategoryDisciplineState } from "../src/features/category-discipline.js";
import type { EnvConfig, HookInput } from "../src/protocol/types.js";

const SESSION_ID = "catdisc-sess";
const tmpRoots: string[] = [];

function tmpWorkspace(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "omg-catdisc-"));
  tmpRoots.push(d);
  return d;
}

afterEach(() => {
  for (const d of tmpRoots.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

/**
 * cfg with pluginData (per-session state root) pointed at an isolated
 * tmpdir. category-discipline.json and last-prompt.json both live under
 * pluginData/<sessionId>/, so this alone isolates them.
 */
function cfg(pluginData: string, over: Partial<EnvConfig> = {}): EnvConfig {
  return {
    pluginRoot: ".",
    pluginData,
    grokHome: ".",
    stateDirName: ".omg",
    skillGate: false,
    intentGate: false,
    planMode: false,
    hashline: false,
    diagEnforce: false,
    hardOrchestration: false,
    maxRalphIter: 10,
    todoCooldownMs: 0,
    todoAbortWindowMs: 0,
    diagCommand: "",
    diagTimeoutMs: 5000,
    hashlineTtlMs: 30 * 60 * 1000,
    commentChecker: false,
    commentCheckerDeny: false,
    agentGuard: false,
    categoryDiscipline: true,
    ...over,
  };
}

function input(pluginData: string, over: Partial<HookInput> = {}): HookInput {
  return {
    raw: {},
    event: "stop",
    sessionId: SESSION_ID,
    cwd: pluginData,
    workspaceRoot: pluginData,
    ...over,
  };
}

/** Absolute path to the per-session state file under the isolated pluginData. */
function stateFile(pluginData: string): string {
  return path.join(pluginData, SESSION_ID, "category-discipline.json");
}

describe("markSpawnActivity", () => {
  it("increments spawnCount to 2 after two calls", () => {
    const pluginData = tmpWorkspace();
    const c = cfg(pluginData);
    const inp = input(pluginData);

    markSpawnActivity(inp, c);
    markSpawnActivity(inp, c);

    const st = JSON.parse(
      fs.readFileSync(stateFile(pluginData), "utf8"),
    ) as CategoryDisciplineState;
    expect(st.spawnCount).toBe(2);
  });

  it("resets prompted back to false on spawn activity", () => {
    const pluginData = tmpWorkspace();
    const c = cfg(pluginData);
    const inp = input(pluginData);

    // Seed a pre-existing state with prompted already true (simulate an
    // earlier session that already prompted the user).
    const file = stateFile(pluginData);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({
        schemaVersion: 1,
        spawnCount: 0,
        prompted: true,
      } satisfies CategoryDisciplineState) + "\n",
      "utf8",
    );

    markSpawnActivity(inp, c);

    const st = JSON.parse(
      fs.readFileSync(file, "utf8"),
    ) as CategoryDisciplineState;
    expect(st.prompted).toBe(false);
  });
});

describe("categoryDisciplineStopReason", () => {
  it("blocks on specialist deep prompt with zero spawns and no prior prompt", () => {
    const pluginData = tmpWorkspace();
    const c = cfg(pluginData);
    const inp = input(pluginData);

    saveLastPrompt(inp, c, "deep dive the auth architecture");

    const reason = categoryDisciplineStopReason(inp, c);
    expect(reason).not.toBeNull();
    expect(reason).toContain("CATEGORY_DISCIPLINE");
    expect(reason).toContain("hephaestus");
  });

  it("returns null on a second call in the same session (once-per-session)", () => {
    const pluginData = tmpWorkspace();
    const c = cfg(pluginData);
    const inp = input(pluginData);

    saveLastPrompt(inp, c, "deep dive the auth architecture");

    const first = categoryDisciplineStopReason(inp, c);
    expect(first).not.toBeNull();
    // Second call in the same session state — prompted now true.
    const second = categoryDisciplineStopReason(inp, c);
    expect(second).toBeNull();
  });

  it("returns null once a spawn has occurred (spawnCount > 0)", () => {
    const pluginData = tmpWorkspace();
    const c = cfg(pluginData);
    const inp = input(pluginData);

    markSpawnActivity(inp, c); // spawnCount -> 1
    saveLastPrompt(inp, c, "deep dive the auth architecture");

    const reason = categoryDisciplineStopReason(inp, c);
    expect(reason).toBeNull();
  });

  it("returns null for non-specialist prompts (e.g. typo / readme)", () => {
    const pluginData = tmpWorkspace();
    const c = cfg(pluginData);
    const inp = input(pluginData);

    // "quick" category -> no specialist advice -> null.
    saveLastPrompt(inp, c, "fix a typo in the footer");
    expect(categoryDisciplineStopReason(inp, c)).toBeNull();

    // "writing" category -> no specialist advice -> null.
    saveLastPrompt(inp, c, "write the readme for this module");
    expect(categoryDisciplineStopReason(inp, c)).toBeNull();
  });

  it("returns null when the cfg toggle is disabled", () => {
    const pluginData = tmpWorkspace();
    const c = cfg(pluginData, { categoryDiscipline: false });
    const inp = input(pluginData);

    saveLastPrompt(inp, c, "deep dive the auth architecture");

    expect(categoryDisciplineStopReason(inp, c)).toBeNull();
  });

  it("returns null when no last prompt has been recorded", () => {
    const pluginData = tmpWorkspace();
    const c = cfg(pluginData);
    const inp = input(pluginData);
    // Deliberately do NOT call saveLastPrompt — loadLastPrompt returns "".

    expect(categoryDisciplineStopReason(inp, c)).toBeNull();
  });
});

describe("categoryDisciplinePreDeny (v1.1.2 host-enforced)", () => {
  it("denies first mutating path with How-to-fix prefix", () => {
    const pluginData = tmpWorkspace();
    const c = cfg(pluginData);
    const inp = input(pluginData, { event: "pre-tool-use", toolName: "Write" });
    saveLastPrompt(inp, c, "deep dive the auth architecture");
    const reason = categoryDisciplinePreDeny(inp, c);
    expect(reason).toMatch(/CATEGORY_DISCIPLINE|hephaestus|How to fix/i);
  });

  it("shares once flag with Stop — PreTool then Stop does not double-yank", () => {
    const pluginData = tmpWorkspace();
    const c = cfg(pluginData);
    const inp = input(pluginData);
    saveLastPrompt(inp, c, "architecture trade-off for auth");
    expect(categoryDisciplinePreDeny(inp, c)).not.toBeNull();
    expect(categoryDisciplineStopReason(inp, c)).toBeNull();
    expect(categoryDisciplinePreDeny(inp, c)).toBeNull();
  });

  it("production PreTool: deep prompt + Write deny once then allow", () => {
    const pluginData = tmpWorkspace();
    const c = cfg(pluginData, {
      skillGate: false,
      hashline: false,
      planMode: false,
      agentGuard: false,
    });
    const base = {
      raw: {},
      event: "pre-tool-use" as const,
      sessionId: SESSION_ID,
      cwd: pluginData,
      workspaceRoot: pluginData,
      toolName: "Write",
      toolInput: { path: path.join(pluginData, "a.ts"), contents: "export {}\n" },
    };
    saveLastPrompt(base, c, "deep dive multi-file auth");
    const first = handlePreToolUse(base, c);
    expect(first.exitCode).toBe(2);
    expect(JSON.stringify(first.output)).toMatch(/CATEGORY_DISCIPLINE/i);
    const second = handlePreToolUse(base, c);
    expect(second.exitCode).toBe(0);
  });

  it("after spawn, PreTool allows deep Write immediately", () => {
    const pluginData = tmpWorkspace();
    const c = cfg(pluginData, {
      skillGate: false,
      hashline: false,
      planMode: false,
      agentGuard: false,
    });
    const base = {
      raw: {},
      event: "pre-tool-use" as const,
      sessionId: SESSION_ID,
      cwd: pluginData,
      workspaceRoot: pluginData,
      toolName: "Write",
      toolInput: { path: path.join(pluginData, "b.ts"), contents: "export {}\n" },
    };
    saveLastPrompt(base, c, "deep dive multi-file auth");
    markSpawnActivity(base, c);
    const r = handlePreToolUse(base, c);
    expect(r.exitCode).toBe(0);
  });
});

describe("state isolation (no real pluginData/.omg pollution)", () => {
  it("writes the state file only inside the injected tmp pluginData", () => {
    const pluginData = tmpWorkspace();
    const realProjectRoot = process.cwd();
    // If isolation broke, the state file would land under the real project.
    expect(pluginData).not.toBe(realProjectRoot);

    markSpawnActivity(input(pluginData), cfg(pluginData));

    const file = stateFile(pluginData);
    expect(file.startsWith(pluginData)).toBe(true);
    expect(fs.existsSync(file)).toBe(true);
    // Real project session dir must remain untouched.
    expect(
      fs.existsSync(path.join(realProjectRoot, SESSION_ID, "category-discipline.json")),
    ).toBe(false);
  });
});
