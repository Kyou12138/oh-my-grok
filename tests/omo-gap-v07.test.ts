/**
 * v0.7 omo-gap functional gates — real handlers only.
 * 1) think-mode keyword injection
 * 2) session sticky agent role for Agent Guard
 * 3) idle-turn Stop yank
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { handlePostToolSpawn } from "../src/events/post-tool.js";
import { handlePreToolUse } from "../src/events/pre-tool-use.js";
import { handleStop } from "../src/events/stop.js";
import { handleUserPrompt } from "../src/events/user-prompt.js";
import {
  clearSessionAgentRole,
  getSessionAgentRole,
  setSessionAgentRole,
} from "../src/features/session-role.js";
import { detectThinkMode, thinkModeBanner } from "../src/features/think-mode.js";
import { isIdleAssistantMessage } from "../src/features/idle-turn.js";
import { mirrorTodos } from "../src/features/todo-boulder.js";
import { startRalph } from "../src/features/ralph.js";
import type { EnvConfig, HookInput } from "../src/protocol/types.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmpRoots: string[] = [];

function tmpWorkspace(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "omg-v07-"));
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
    agentGuard: true,
    ...over,
  };
}

function base(ws: string, over: Partial<HookInput> = {}): HookInput {
  return {
    raw: {},
    event: "user-prompt",
    sessionId: "v07-sess",
    cwd: ws,
    workspaceRoot: ws,
    ...over,
  };
}

describe("omo-gap inventory artifact", () => {
  it("exists and names ≥3 Grok-feasible gaps + blocked Team Mode / multi-model / LSP", () => {
    const p = path.join(root, "docs", "omo-gap.md");
    expect(fs.existsSync(p)).toBe(true);
    const t = fs.readFileSync(p, "utf8");
    expect(t).toMatch(/Grok-feasible/i);
    expect(t).toMatch(/think/i);
    expect(t).toMatch(/idle|session.*role|Todo/i);
    expect(t).toMatch(/Team Mode/i);
    expect(t).toMatch(/multi-?model|model routing|multi-provider/i);
    expect(t).toMatch(/LSP|AST/i);
    expect(t).toMatch(/blocked|non-goal|不/i);
  });
});

describe("think-mode keyword injection", () => {
  it("detects ultrathink / think deeply / 仔细想", () => {
    expect(detectThinkMode("please ultrathink the design")).toBe(true);
    expect(detectThinkMode("think deeply about tradeoffs")).toBe(true);
    expect(detectThinkMode("仔细想一下架构")).toBe(true);
    expect(detectThinkMode("fix typo")).toBe(false);
  });

  it("UserPrompt injects THINK_MODE banner", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const out = handleUserPrompt(
      base(ws, { prompt: "ultrathink the auth redesign" }),
      cfg(data),
    );
    expect("additionalContext" in out && out.additionalContext).toMatch(
      /THINK_MODE|extended|深度|ultrathink/i,
    );
    expect(thinkModeBanner(true)).toMatch(/THINK_MODE/);
  });
});

describe("session sticky agent role", () => {
  it("setSessionAgentRole persists and resolve denies Write without agentName on input", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data);
    const input = base(ws);
    setSessionAgentRole(input, c, "oracle");
    expect(getSessionAgentRole(input, c)).toBe("oracle");
    const r = handlePreToolUse(
      base(ws, {
        event: "pre-tool-use",
        toolName: "Write",
        // no agentName — must use sticky session role
        toolInput: { path: path.join(ws, "x.ts"), contents: "export {}\n" },
      }),
      c,
    );
    expect(r.exitCode).toBe(2);
    expect(JSON.stringify(r.output)).toMatch(/AGENT_GUARD|oracle|read-only/i);
  });

  it("PostTool spawn_subagent does not sticky-lock parent to child role", () => {
    // v1.1.1: parent session fires spawn/SubagentStart — sticky explore would block parent writes
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data);
    const out = handlePostToolSpawn(
      base(ws, {
        event: "post-tool-write",
        toolName: "spawn_subagent",
        toolInput: { subagent_type: "explore", prompt: "find auth" },
      }),
      c,
    );
    expect(getSessionAgentRole(base(ws), c)).toBe("");
    expect(JSON.stringify(out)).toMatch(/followthrough|OMG_SPAWN/i);
    expect(JSON.stringify(out)).not.toMatch(/sticky="explore"/i);
  });

  it("/agent hephaestus clears read-only lock for writes", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data);
    setSessionAgentRole(base(ws), c, "oracle");
    handleUserPrompt(base(ws, { prompt: "/agent hephaestus" }), c);
    expect(getSessionAgentRole(base(ws), c)).toBe("hephaestus");
    const r = handlePreToolUse(
      base(ws, {
        event: "pre-tool-use",
        toolName: "Write",
        toolInput: { path: path.join(ws, "ok.ts"), contents: "export const n = 1;\n" },
      }),
      c,
    );
    expect(r.exitCode).toBe(0);
  });

  it("/agent hephaestus wins over host agentName=oracle on same prompt and later tools", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data);
    // Host still tags session as oracle (subagent context) while user clears lock
    handleUserPrompt(
      base(ws, {
        prompt: "/agent hephaestus",
        agentName: "oracle",
        raw: { agentName: "oracle" },
      }),
      c,
    );
    expect(getSessionAgentRole(base(ws), c)).toBe("hephaestus");
    // Documented clear path: Write without agentName allowed
    const r = handlePreToolUse(
      base(ws, {
        event: "pre-tool-use",
        toolName: "Write",
        toolInput: { path: path.join(ws, "ok2.ts"), contents: "export const n = 2;\n" },
      }),
      c,
    );
    expect(r.exitCode).toBe(0);
    // Host keeps stamping agentName=oracle on every tool — slash sticky must still win
    const rHost = handlePreToolUse(
      base(ws, {
        event: "pre-tool-use",
        toolName: "Write",
        agentName: "oracle",
        raw: { agentName: "oracle" },
        toolInput: { path: path.join(ws, "ok3.ts"), contents: "export const n = 3;\n" },
      }),
      c,
    );
    expect(rHost.exitCode).toBe(0);
    expect(JSON.stringify(rHost.output)).not.toMatch(/AGENT_GUARD/);
  });

  it("multi-turn: /agent hephaestus then host-oracle UserPrompt keeps write allow", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data);
    // Turn 1: user unlocks
    handleUserPrompt(
      base(ws, {
        prompt: "/agent hephaestus",
        agentName: "oracle",
        raw: { agentName: "oracle" },
      }),
      c,
    );
    expect(getSessionAgentRole(base(ws), c)).toBe("hephaestus");
    // Turn 2: non-slash prompt, host still tags oracle — must NOT overwrite slash sticky
    handleUserPrompt(
      base(ws, {
        prompt: "continue implementing the feature",
        agentName: "oracle",
        raw: { agentName: "oracle" },
      }),
      c,
    );
    expect(getSessionAgentRole(base(ws), c)).toBe("hephaestus");
    const r = handlePreToolUse(
      base(ws, {
        event: "pre-tool-use",
        toolName: "Write",
        agentName: "oracle",
        raw: { agentName: "oracle" },
        toolInput: { path: path.join(ws, "mt.ts"), contents: "export const m = 1;\n" },
      }),
      c,
    );
    expect(r.exitCode).toBe(0);
  });

  it("clearSessionAgentRole restores fail-open", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data);
    setSessionAgentRole(base(ws), c, "librarian");
    clearSessionAgentRole(base(ws), c);
    const r = handlePreToolUse(
      base(ws, {
        event: "pre-tool-use",
        toolName: "Write",
        toolInput: { path: path.join(ws, "m.ts"), contents: "1\n" },
      }),
      c,
    );
    expect(r.exitCode).toBe(0);
  });
});

describe("idle-turn Stop yank", () => {
  it("detects empty and fluff messages as idle", () => {
    expect(isIdleAssistantMessage("")).toBe(true);
    expect(isIdleAssistantMessage("   ")).toBe(true);
    expect(isIdleAssistantMessage("ok")).toBe(true);
    expect(isIdleAssistantMessage("I'll continue shortly.")).toBe(true);
    expect(isIdleAssistantMessage("好的")).toBe(true);
    expect(
      isIdleAssistantMessage("Edited src/auth.ts and ran npm test — all green."),
    ).toBe(false);
  });

  it("Stop blocks idle message when incomplete todos remain", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data, { todoCooldownMs: 0 });
    const input = base(ws);
    mirrorTodos(input, c, [
      { content: "finish feature", status: "pending" },
      { content: "add tests", status: "in_progress" },
    ]);
    const stop = handleStop(
      base(ws, { event: "stop", lastAssistantMessage: "ok" }),
      c,
    );
    expect(stop).toMatchObject({ decision: "block" });
    expect(JSON.stringify(stop)).toMatch(/IDLE|TODO|continue|incomplete/i);
  });

  it("Stop blocks idle message when ULW loop active", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data);
    startRalph(base(ws), c, "ship it", "ulw");
    // advance iter
    handleStop(base(ws, { event: "stop", lastAssistantMessage: "starting work on files" }), c);
    const stop = handleStop(
      base(ws, { event: "stop", lastAssistantMessage: "..." }),
      c,
    );
    expect(stop).toMatchObject({ decision: "block" });
    // idle fluff with no activity should mention stall or idle
    expect(JSON.stringify(stop)).toMatch(/STALL|IDLE|ULW|continue/i);
  });
});
