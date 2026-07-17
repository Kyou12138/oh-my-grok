import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { handlePostToolRead, handlePostToolWrite } from "../src/events/post-tool.js";
import { handleStop } from "../src/events/stop.js";
import { handleUserPrompt } from "../src/events/user-prompt.js";
import { markVerified } from "../src/features/diagnostics.js";
import {
  detectRalphCommand,
  loadRalph,
  noteUlwRead,
  noteUlwWrite,
  startRalph,
} from "../src/features/ralph.js";
import type { EnvConfig, HookInput } from "../src/protocol/types.js";

const tmpRoots: string[] = [];

function tmpWorkspace(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "omg-ulw-"));
  tmpRoots.push(d);
  return d;
}

afterEach(() => {
  for (const d of tmpRoots.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

function cfg(pluginData: string): EnvConfig {
  return {
    pluginRoot: process.cwd(),
    pluginData,
    grokHome: pluginData,
    stateDirName: ".omg",
    skillGate: false,
    intentGate: true,
    planMode: true,
    hashline: false,
    diagEnforce: false,
    hardOrchestration: true,
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
  };
}

function baseInput(ws: string, over: Partial<HookInput> = {}): HookInput {
  return {
    raw: {},
    event: "stop",
    sessionId: "ulw-sess",
    cwd: ws,
    workspaceRoot: ws,
    ...over,
  };
}

describe("detect ULW mid-sentence", () => {
  it("starts ulw from mid-sentence keyword", () => {
    expect(detectRalphCommand("请 ulw 重构登录模块").action).toBe("start-ulw");
    expect(detectRalphCommand("please ultrawork this feature").action).toBe("start-ulw");
    expect(detectRalphCommand("ulw fix tests").task).toMatch(/fix tests/i);
  });
});

describe("ULW v2 done gate", () => {
  it("rejects DONE without explore/implement/verify", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data);
    const input = baseInput(ws);
    startRalph(input, c, "ship feature", "ulw");
    const out = handleStop(
      baseInput(ws, {
        lastAssistantMessage:
          "ULTRAWORK MODE ENABLED!\nall done <promise>DONE</promise>",
      }),
      c,
    );
    expect(out).toMatchObject({ decision: "block" });
    expect(JSON.stringify(out)).toMatch(/DONE REJECTED|evidence/i);
    // still active
    expect(loadRalph(input, c)?.mode).toBe("ulw");
  });

  it("accepts DONE after read+write+verified", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data);
    const input = baseInput(ws);
    startRalph(input, c, "ship feature", "ulw");
    noteUlwRead(input, c, "a.ts");
    noteUlwWrite(input, c, "a.ts");
    // stop once to advance phase from activity (+ ceremony opener)
    handleStop(
      baseInput(ws, {
        lastAssistantMessage: "ULTRAWORK MODE ENABLED!\nGoal: ship feature\nworking",
      }),
      c,
    );
    // activity reset after continue — re-note for gate (phaseReached already set)
    noteUlwRead(input, c, "a.ts");
    noteUlwWrite(input, c, "b.ts");
    markVerified(input, c);
    const out = handleStop(
      baseInput(ws, {
        lastAssistantMessage: "<promise>VERIFIED</promise>\n<promise>DONE</promise>",
      }),
      c,
    );
    // should not block for ralph (loop cleared)
    if ("decision" in out && out.decision === "block") {
      // might still block for other reasons — must not be DONE REJECTED
      expect(JSON.stringify(out)).not.toMatch(/DONE REJECTED/);
    }
    expect(loadRalph(input, c)).toBeNull();
  });
});

describe("ULW progress artifacts", () => {
  it("writes state.json and log on start/continue", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data);
    const input = baseInput(ws, { event: "user-prompt", prompt: "ulw build api" });
    handleUserPrompt(input, c);
    expect(fs.existsSync(path.join(ws, ".omg", "ulw-loop", "state.json"))).toBe(true);
    handleStop(baseInput(ws, { lastAssistantMessage: "still going" }), c);
    const logDir = path.join(ws, ".omg", "ulw-loop", "log");
    expect(fs.existsSync(logDir)).toBe(true);
    const logs = fs.readdirSync(logDir);
    expect(logs.length).toBeGreaterThan(0);
  });
});

describe("activity hooks", () => {
  it("notes read/write via post-tool", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data);
    const f = path.join(ws, "x.ts");
    fs.writeFileSync(f, "export {}\n");
    const input = baseInput(ws);
    startRalph(input, c, "t", "ulw");
    handlePostToolRead(
      baseInput(ws, { event: "post-tool-read", toolName: "Read", toolInput: { path: f } }),
      c,
    );
    handlePostToolWrite(
      baseInput(ws, {
        event: "post-tool-write",
        toolName: "Write",
        toolInput: { path: f },
      }),
      c,
    );
    // continue stop should not stall
    const out = handleStop(baseInput(ws, { lastAssistantMessage: "progress" }), c);
    expect(out).toMatchObject({ decision: "block" });
    expect(JSON.stringify(out)).not.toMatch(/STALL DETECTED/);
  });
});
