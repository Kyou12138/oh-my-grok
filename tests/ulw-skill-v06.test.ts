/**
 * v0.6 functional upgrades:
 * - ULW shell activity → verify evidence
 * - Intent-aware Skill Gate (require relevant skill when matched)
 * Drives shipped handlers only.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { handlePostToolShell } from "../src/events/post-tool.js";
import { handlePreToolUse } from "../src/events/pre-tool-use.js";
import { handleStop } from "../src/events/stop.js";
import { handleUserPrompt } from "../src/events/user-prompt.js";
import { markSkillLoaded, refreshCatalog, scanSkillCatalog } from "../src/features/skill-gate.js";
import {
  loadRalph,
  loadUlwActivity,
  noteUlwShell,
  startRalph,
} from "../src/features/ralph.js";
import type { EnvConfig, HookInput } from "../src/protocol/types.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmpRoots: string[] = [];

function tmpWorkspace(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "omg-v06-"));
  tmpRoots.push(d);
  return d;
}

afterEach(() => {
  for (const d of tmpRoots.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

function cfg(pluginData: string, over: Partial<EnvConfig> = {}): EnvConfig {
  return {
    pluginRoot: root,
    pluginData,
    grokHome: pluginData,
    stateDirName: ".omg",
    skillGate: true,
    intentGate: true,
    planMode: true,
    hashline: false,
    diagEnforce: false,
    hardOrchestration: false,
    maxRalphIter: 10,
    todoCooldownMs: 0,
    todoAbortWindowMs: 0,
    todoMaxContinues: 20,
    todoMaxStagnation: 3,
    diagCommand: "",
    diagTimeoutMs: 5000,
    hashlineTtlMs: 30 * 60 * 1000,
    commentChecker: false,
    commentCheckerDeny: false,
    agentGuard: false,
    ...over,
  };
}

function base(ws: string, over: Partial<HookInput> = {}): HookInput {
  return {
    raw: {},
    event: "user-prompt",
    sessionId: "v06-sess",
    cwd: ws,
    workspaceRoot: ws,
    ...over,
  };
}

describe("ULW shell activity → verify", () => {
  it("noteUlwShell increments shells and marks verify on test commands", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data);
    const input = base(ws);
    startRalph(input, c, "fix tests", "ulw");
    noteUlwShell(input, c, "npm test");
    const act = loadUlwActivity(input, c);
    expect(act.shells).toBeGreaterThanOrEqual(1);
    const loop = loadRalph(input, c);
    expect(loop?.phaseReached.verify).toBe(true);
  });

  it("post-tool shell handler drives ULW verify via real event path", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data);
    const input = base(ws);
    startRalph(input, c, "ship suite", "ulw");
    handlePostToolShell(
      base(ws, {
        event: "post-tool-write",
        toolName: "run_terminal_command",
        toolInput: { command: "npm run test" },
      }),
      c,
    );
    expect(loadUlwActivity(input, c).shells).toBeGreaterThanOrEqual(1);
    expect(loadRalph(input, c)?.phaseReached.verify).toBe(true);
  });

  it("argv array command still credits ULW verify (v1.1.39)", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data);
    const input = base(ws);
    startRalph(input, c, "ship suite argv", "ulw");
    // Host often sends command as string[] — String(arr) => "npm,test" misses VERIFY_SHELL_RE
    const out = handlePostToolShell(
      base(ws, {
        event: "post-tool-shell",
        toolName: "Bash",
        toolInput: { command: ["npm", "test"] },
      }),
      c,
    );
    expect(loadUlwActivity(input, c).shells).toBeGreaterThanOrEqual(1);
    expect(loadRalph(input, c)?.phaseReached.verify).toBe(true);
    expect(JSON.stringify(out)).toMatch(/OMG_ULW_SHELL|npm test/i);
  });

  it("non-test shell increments activity without auto-verify", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data);
    const input = base(ws);
    startRalph(input, c, "list files", "ulw");
    noteUlwShell(input, c, "ls -la");
    expect(loadUlwActivity(input, c).shells).toBeGreaterThanOrEqual(1);
    expect(loadRalph(input, c)?.phaseReached.verify).toBe(false);
  });
});

describe("intent-aware Skill Gate", () => {
  it("catalog includes superpowers skills from plugin root", () => {
    const cat = scanSkillCatalog(root);
    expect(cat.length).toBeGreaterThan(0);
    expect(cat.some((s) => /test-driven|verification|brainstorm/i.test(s.id + s.name))).toBe(
      true,
    );
  });

  it("denies mutation when TDD skill suggested but not loaded", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data, { skillGate: true, hashline: false });
    // Store task context via user prompt (tests/TDD keywords)
    handleUserPrompt(
      base(ws, { prompt: "please implement feature with TDD and unit tests" }),
      c,
    );
    refreshCatalog(base(ws), c);
    const r = handlePreToolUse(
      base(ws, {
        event: "pre-tool-use",
        toolName: "Write",
        toolInput: {
          path: path.join(ws, "foo.test.ts"),
          contents: "export {}\n",
        },
      }),
      c,
    );
    expect(r.exitCode).toBe(2);
    expect(JSON.stringify(r.output)).toMatch(/Skill Gate|SKILL\.md|test-driven|TDD|relevant/i);
  });

  it("allows mutation after loading a suggested skill", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data, { skillGate: true, hashline: false });
    handleUserPrompt(
      base(ws, { prompt: "implement with TDD unit tests" }),
      c,
    );
    const state = refreshCatalog(base(ws), c);
    const tdd = state.catalog.find((s) => /test-driven/i.test(s.id + s.name));
    expect(tdd).toBeTruthy();
    markSkillLoaded(base(ws), c, tdd!.path);
    const r = handlePreToolUse(
      base(ws, {
        event: "pre-tool-use",
        toolName: "Write",
        toolInput: {
          path: path.join(ws, "bar.test.ts"),
          contents: "export const x = 1;\n",
        },
      }),
      c,
    );
    expect(r.exitCode).toBe(0);
  });

  it("fail-open style: when skillGate off, allow write", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data, { skillGate: false, hashline: false });
    handleUserPrompt(base(ws, { prompt: "TDD everything" }), c);
    const r = handlePreToolUse(
      base(ws, {
        event: "pre-tool-use",
        toolName: "Write",
        toolInput: { path: path.join(ws, "z.ts"), contents: "1\n" },
      }),
      c,
    );
    expect(r.exitCode).toBe(0);
  });
});

describe("ULW still blocks Stop without DONE after shell", () => {
  it("shell alone does not complete loop without DONE marker", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data, { skillGate: false });
    handleUserPrompt(base(ws, { prompt: "ulw fix the suite" }), c);
    noteUlwShell(base(ws), c, "npm test");
    const stop = handleStop(
      base(ws, { event: "stop", lastAssistantMessage: "ran tests" }),
      c,
    );
    expect(stop).toMatchObject({ decision: "block" });
  });

  it("shell-only activity on iter>0 is NOT treated as STALL", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data, { skillGate: false });
    const input = base(ws);
    startRalph(input, c, "verify suite", "ulw");
    // First stop: advance iteration to > 0 (empty activity may stall once — discard)
    handleStop(base(ws, { event: "stop", lastAssistantMessage: "starting" }), c);
    expect(loadRalph(input, c)?.iteration).toBeGreaterThan(0);
    // Second round: only shell progress (no Read/Write)
    noteUlwShell(input, c, "npm test");
    const stop = handleStop(
      base(ws, { event: "stop", lastAssistantMessage: "ran npm test" }),
      c,
    );
    expect(stop).toMatchObject({ decision: "block" });
    expect(JSON.stringify(stop)).not.toMatch(/STALL DETECTED/);
    // progress log should record shells=
    const logDir = path.join(ws, ".omg", "ulw-loop", "log");
    const logs = fs.readdirSync(logDir).map((f) =>
      fs.readFileSync(path.join(logDir, f), "utf8"),
    );
    expect(logs.some((t) => /shells=\d+/.test(t))).toBe(true);
  });
});
