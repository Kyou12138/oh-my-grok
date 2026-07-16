import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { handlePreToolUse } from "../src/events/pre-tool-use.js";
import { handleStop } from "../src/events/stop.js";
import { handleUserPrompt } from "../src/events/user-prompt.js";
import { detectIntent, intentBanner } from "../src/features/intent-gate.js";
import { detectRalphCommand, startRalph } from "../src/features/ralph.js";
import type { EnvConfig, HookInput } from "../src/protocol/types.js";

const tmpRoots: string[] = [];

function tmpWorkspace(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "omg-test-"));
  tmpRoots.push(d);
  return d;
}

afterEach(() => {
  for (const d of tmpRoots.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

function cfg(pluginRoot: string, pluginData: string, over: Partial<EnvConfig> = {}): EnvConfig {
  return {
    pluginRoot,
    pluginData,
    grokHome: pluginData,
    stateDirName: ".omg",
    skillGate: true,
    intentGate: true,
    planMode: true,
    hashline: false,
    diagEnforce: false,
    hardOrchestration: true,
    maxRalphIter: 5,
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

function baseInput(ws: string, over: Partial<HookInput> = {}): HookInput {
  return {
    raw: {},
    event: "user-prompt",
    sessionId: "test-session",
    cwd: ws,
    workspaceRoot: ws,
    ...over,
  };
}

describe("ralph commands", () => {
  it("detects ralph and ulw", () => {
    expect(detectRalphCommand('/ralph-loop "fix it"').action).toBe("start-ralph");
    expect(detectRalphCommand("/ulw-loop ship").action).toBe("start-ulw");
    expect(detectRalphCommand("ultrawork now").action).toBe("start-ulw");
    expect(detectRalphCommand("/cancel-ralph").action).toBe("cancel");
  });
});

describe("intent gate", () => {
  it("classifies ultrawork and debug", () => {
    expect(detectIntent("please ultrawork this")).toBe("ultrawork");
    expect(detectIntent("debug the failing test")).toBe("debug");
    expect(intentBanner("search")).toContain("INTENT: search");
  });
});

describe("stop chain", () => {
  it("blocks when ralph active", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "plugin-data");
    const c = cfg(process.cwd(), data);
    const input = baseInput(ws, { event: "stop" });
    startRalph(input, c, "do work", "ralph");
    const out = handleStop(input, c);
    expect(out).toMatchObject({ decision: "block" });
    expect(JSON.stringify(out)).toContain("RALPH");
  });

  it("releases when DONE marker present (ralph mode)", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "plugin-data");
    const c = cfg(process.cwd(), data);
    const input = baseInput(ws, {
      event: "stop",
      lastAssistantMessage: "all good <promise>DONE</promise>",
    });
    startRalph(input, c, "do work", "ralph");
    const out = handleStop(input, c);
    expect(out).toEqual({});
  });

  it("ULW rejects bare DONE without evidence", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "plugin-data");
    const c = cfg(process.cwd(), data);
    const input = baseInput(ws, {
      event: "stop",
      lastAssistantMessage: "all good <promise>DONE</promise>",
    });
    startRalph(input, c, "do work", "ulw");
    const out = handleStop(input, c);
    expect(out).toMatchObject({ decision: "block" });
    expect(JSON.stringify(out)).toMatch(/DONE REJECTED/);
  });
});

describe("user prompt", () => {
  it("injects sisyphus banner on first prompt", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "plugin-data");
    // use repo root as plugin for skills/rules
    const pluginRoot = path.resolve(__dirname, "..");
    const c = cfg(pluginRoot, data);
    const out = handleUserPrompt(baseInput(ws, { prompt: "hello" }), c);
    expect("additionalContext" in out).toBe(true);
    if ("additionalContext" in out) {
      expect(out.additionalContext).toContain("Sisyphus");
      expect(out.additionalContext).toContain("oh-my-grok");
    }
  });

  it("starts ralph via slash", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "plugin-data");
    const c = cfg(path.resolve(__dirname, ".."), data);
    const out = handleUserPrompt(
      baseInput(ws, { prompt: '/ralph-loop "finish tests"' }),
      c,
    );
    if ("additionalContext" in out) {
      expect(out.additionalContext).toContain("Ralph loop started");
    }
    expect(fs.existsSync(path.join(ws, ".omg", "ralph-loop.local.md"))).toBe(true);
  });
});

describe("skill gate", () => {
  it("denies mutate when catalog non-empty and nothing loaded", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "plugin-data");
    const pluginRoot = path.resolve(__dirname, "..");
    const c = cfg(pluginRoot, data);
    // seed catalog via session-like refresh by running pretool after user prompt built catalog
    handleUserPrompt(baseInput(ws, { prompt: "hi" }), c);
    const r = handlePreToolUse(
      baseInput(ws, { event: "pre-tool-use", toolName: "Write", toolInput: { path: "x.ts" } }),
      c,
    );
    // catalog from real skills should be non-empty → deny
    expect(r.exitCode).toBe(2);
    expect(r.output).toMatchObject({ decision: "deny" });
  });
});
