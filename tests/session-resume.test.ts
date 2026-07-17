/**
 * session-resume summary (v1.0 P2).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { handleSessionStart } from "../src/events/session-start.js";
import type { EnvConfig, HookInput } from "../src/protocol/types.js";
import { writeHandoffStub } from "../src/features/handoff.js";
import { loadRalph, saveRalph, startRalph } from "../src/features/ralph.js";
import { sessionResumeSummary } from "../src/features/session-resume.js";
import {
  markSpawnFollowThrough,
  markSubagentChildFinished,
} from "../src/features/spawn-followthrough.js";
import {
  setBoulder,
  mirrorTodos,
  markTodoContinued,
} from "../src/features/todo-boulder.js";

const tmpRoots: string[] = [];

function tmpWorkspace(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "omg-resume-"));
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
    planMode: false,
    hashline: false,
    diagEnforce: false,
    hardOrchestration: false,
    maxRalphIter: 10,
    maxUlwStall: 8,
    todoCooldownMs: 5000,
    todoAbortWindowMs: 3000,
    diagCommand: "",
    diagTimeoutMs: 5000,
    hashlineTtlMs: 30 * 60 * 1000,
    commentChecker: false,
    commentCheckerDeny: false,
    agentGuard: false,
    categoryDiscipline: false,
    todoMaxContinues: 20,
    todoMaxStagnation: 3,
  };
}

function base(ws: string, over: Partial<HookInput> = {}): HookInput {
  return {
    raw: {},
    event: "session-start",
    sessionId: "resume-sess",
    cwd: ws,
    workspaceRoot: ws,
    ...over,
  };
}

describe("sessionResumeSummary", () => {
  it("always emits banner when no workspace state (v1.1.24 wow path)", () => {
    const ws = tmpWorkspace();
    const s = sessionResumeSummary(base(ws), cfg(path.join(ws, "pdata")));
    expect(s).toMatch(/OMG_SESSION_RESUME/);
    expect(s).toMatch(/Hashline|PreTool|plan-mode/i);
  });

  it("lists active ULW + boulder + open checkboxes + todos + handoff", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    startRalph(input, c, "ship oauth", "ulw");
    const planPath = path.join(ws, ".omg", "plans", "p.md");
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(planPath, "# Plan\n- [ ] still open\n- [x] done\n", "utf8");
    setBoulder(input, c, {
      schemaVersion: 1,
      active: true,
      planPath,
      title: "oauth plan",
      notes: "",
      updatedAt: new Date().toISOString(),
    });
    mirrorTodos(input, c, [{ content: "write tests", status: "pending" }]);
    writeHandoffStub(input, c, "/handoff mid work");
    const s = sessionResumeSummary(input, c);
    expect(s).toMatch(/OMG_SESSION_RESUME/);
    expect(s).toMatch(/ULW|oauth/i);
    expect(s).toMatch(/Boulder|oauth plan/i);
    expect(s).toMatch(/open plan checkboxes/i);
    expect(s).toMatch(/Todos|write tests/i);
    expect(s).toMatch(/Handoff/i);
  });

  it("SessionStart includes SESSION_RESUME when ralph active", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    startRalph(base(ws), c, "finish gates", "ulw");
    const out = handleSessionStart(base(ws), c);
    expect("additionalContext" in out && out.additionalContext).toMatch(
      /OMG_SESSION_RESUME|finish gates|ULW/i,
    );
  });

  it("ULW resume shows ceremony/researchOnly/stall + phaseReached (v1.1.65)", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    startRalph(input, c, "调研 auth 模块", "ulw");
    let s = sessionResumeSummary(input, c);
    expect(s).toMatch(/researchOnly=true/i);
    expect(s).toMatch(/ceremony=false|ceremony incomplete/i);
    expect(s).toMatch(/reached: explore=/i);
    const loop = loadRalph(input, c)!;
    loop.ceremonyOpened = true;
    loop.stallCount = 4;
    loop.phaseReached.explore = true;
    saveRalph(input, c, loop);
    s = sessionResumeSummary(input, c);
    expect(s).toMatch(/stall×4|stall=4/i);
    expect(s).toMatch(/maxUlwStall|STALL CIRCUIT/i);
    expect(s).toMatch(/explore=true/i);
  });

  it("resume shows todo circuit open + spawn follow-through (v1.1.65)", () => {
    const ws = tmpWorkspace();
    const c = {
      ...cfg(path.join(ws, "pdata")),
      todoMaxStagnation: 2,
    };
    const input = base(ws);
    const todos = [{ content: "stuck item", status: "pending" }];
    mirrorTodos(input, c, todos);
    // two yanks same fingerprint → stagnation circuit
    markTodoContinued(input, c, Date.now(), todos);
    markTodoContinued(input, c, Date.now() + 10_000, todos);
    markSpawnFollowThrough(input, c, "explore");
    markSubagentChildFinished(input, c, "explore");
    const s = sessionResumeSummary(input, c);
    expect(s).toMatch(/Todo enforcer CIRCUIT OPEN|stagnation/i);
    expect(s).toMatch(/Spawn follow-through|explore|childFinished/i);
  });
});

