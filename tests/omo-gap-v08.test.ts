/**
 * v0.8 remaining omo-gap functional upgrades:
 * 1) Multi-goal ULW list — DONE blocked until all goals done
 * 2) Todo Enforcer abort-window — force continue after abort-like stop within window
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { handleStop } from "../src/events/stop.js";
import { handleUserPrompt } from "../src/events/user-prompt.js";
import { markVerified } from "../src/features/diagnostics.js";
import {
  loadRalph,
  noteUlwRead,
  noteUlwWrite,
  parseGoalsFromTask,
  startRalph,
} from "../src/features/ralph.js";
import {
  markTodoContinued,
  mirrorTodos,
  todoEnforcerAllows,
} from "../src/features/todo-boulder.js";
import type { EnvConfig, HookInput } from "../src/protocol/types.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmpRoots: string[] = [];

function tmpWorkspace(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "omg-v08-"));
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
    skillGate: false,
    intentGate: true,
    planMode: true,
    hashline: false,
    diagEnforce: false,
    hardOrchestration: false,
    maxRalphIter: 20,
    todoCooldownMs: 60_000,
    todoAbortWindowMs: 5_000,
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
    event: "stop",
    sessionId: "v08-sess",
    cwd: ws,
    workspaceRoot: ws,
    ...over,
  };
}

describe("inventory remaining gaps", () => {
  it("omo-gap.md lists remaining Grok-feasible items beyond v0.7", () => {
    const t = fs.readFileSync(path.join(root, "docs", "omo-gap.md"), "utf8");
    expect(t).toMatch(/Todo Enforcer|multi-?goal|abort/i);
    expect(t).toMatch(/Team Mode/i);
    expect(t).toMatch(/blocked|platform/i);
  });
});

describe("multi-goal ULW", () => {
  it("parses multi-goal tasks from ; | and numbered lists", () => {
    expect(parseGoalsFromTask("fix login; add tests; ship docs")).toEqual([
      "fix login",
      "add tests",
      "ship docs",
    ]);
    expect(parseGoalsFromTask("a | b | c").length).toBe(3);
    expect(parseGoalsFromTask("1) one 2) two 3) three").length).toBe(3);
    expect(parseGoalsFromTask("single task only")).toEqual(["single task only"]);
  });

  it("startRalph stores goals; Stop reason lists open goals", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data);
    const input = base(ws);
    startRalph(input, c, "explore auth; implement fix; verify tests", "ulw");
    const st = loadRalph(input, c);
    expect(st?.goals?.length).toBe(3);
    expect(st?.goals?.every((g) => !g.done)).toBe(true);
    const stop = handleStop(
      base(ws, { lastAssistantMessage: "working on first goal" }),
      c,
    );
    expect(stop).toMatchObject({ decision: "block" });
    expect(JSON.stringify(stop)).toMatch(/GOAL|explore auth|implement fix|verify tests/i);
  });

  it("DONE rejected while open goals remain even with VERIFIED", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data);
    const input = base(ws);
    startRalph(input, c, "goal A; goal B", "ulw");
    const stop = handleStop(
      base(ws, {
        lastAssistantMessage:
          "all good <promise>VERIFIED</promise> <promise>DONE</promise>",
      }),
      c,
    );
    expect(stop).toMatchObject({ decision: "block" });
    expect(JSON.stringify(stop)).toMatch(/GOAL|DONE REJECTED|open/i);
    expect(loadRalph(input, c)?.active).toBe(true);
  });

  it("GOAL_DONE markers clear goals; full evidence then DONE ends loop", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data);
    const input = base(ws);
    startRalph(input, c, "goal A; goal B", "ulw");
    noteUlwRead(input, c, "a.ts");
    noteUlwWrite(input, c, "a.ts");
    handleStop(base(ws, { lastAssistantMessage: "implemented goal A" }), c);
    noteUlwRead(input, c, "a.ts");
    noteUlwWrite(input, c, "b.ts");
    markVerified(input, c);
    const stop = handleStop(
      base(ws, {
        lastAssistantMessage: [
          "GOAL_DONE: goal A",
          "GOAL_DONE: goal B",
          "<promise>VERIFIED</promise>",
          "<promise>DONE</promise>",
        ].join("\n"),
      }),
      c,
    );
    if ("decision" in stop && stop.decision === "block") {
      expect(JSON.stringify(stop)).not.toMatch(/open goal/i);
    }
    expect(loadRalph(input, c)).toBeNull();
  });
});

describe("todo abort-window", () => {
  it("cooldown blocks re-yank, but abort-window re-allows after abort-like stop", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data, { todoCooldownMs: 60_000, todoAbortWindowMs: 10_000 });
    const input = base(ws);
    mirrorTodos(input, c, [{ content: "finish me", status: "pending" }]);
    const t0 = 1_000_000;
    markTodoContinued(input, c, t0);
    const cool = todoEnforcerAllows(
      base(ws, { stopReason: "end_turn" }),
      c,
      t0 + 1_000,
    );
    expect(cool.allow).toBe(false);
    expect(cool.reason).toMatch(/cooldown/i);
    const abort = todoEnforcerAllows(
      base(ws, { stopReason: "tool_error" }),
      c,
      t0 + 2_000,
    );
    expect(abort.allow).toBe(true);
    expect(abort.reason).toMatch(/abort/i);
  });

  it("Stop re-yanks on abort stopReason within window despite cooldown", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data, { todoCooldownMs: 60_000, todoAbortWindowMs: 30_000 });
    const input = base(ws);
    mirrorTodos(input, c, [{ content: "open work", status: "in_progress" }]);
    const first = handleStop(
      base(ws, {
        lastAssistantMessage: "started work on open work",
        stopReason: "end_turn",
      }),
      c,
    );
    expect(first).toMatchObject({ decision: "block" });
    const second = handleStop(
      base(ws, {
        lastAssistantMessage: "tool blew up mid-task",
        stopReason: "aborted",
      }),
      c,
    );
    expect(second).toMatchObject({ decision: "block" });
    expect(JSON.stringify(second)).toMatch(/TODO|open work|ABORT|continue/i);
  });
});

describe("user-prompt multi-goal start", () => {
  it("ulw with multi-goal task stores goals via UserPrompt", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data);
    handleUserPrompt(
      base(ws, {
        event: "user-prompt",
        prompt: "ulw fix a; fix b; verify all",
      }),
      c,
    );
    const st = loadRalph(base(ws), c);
    expect(st?.mode).toBe("ulw");
    expect(st?.goals?.length).toBeGreaterThanOrEqual(2);
  });
});
