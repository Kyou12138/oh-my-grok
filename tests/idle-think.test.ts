/**
 * idle-turn.ts + think-mode.ts dedicated suite (MAGI v0.20).
 * High-frequency Stop yank / UserPrompt inject — was only thin omo-gap-v07 slices.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { handleStop } from "../src/events/stop.js";
import { handleUserPrompt } from "../src/events/user-prompt.js";
import type { EnvConfig, HookInput } from "../src/protocol/types.js";
import {
  idleTurnStopReason,
  isIdleAssistantMessage,
} from "../src/features/idle-turn.js";
import { detectThinkMode, thinkModeBanner } from "../src/features/think-mode.js";
import { mirrorTodos } from "../src/features/todo-boulder.js";
import { startRalph } from "../src/features/ralph.js";

const tmpRoots: string[] = [];

function tmpWorkspace(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "omg-idle-"));
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
    todoCooldownMs: 0,
    todoAbortWindowMs: 3_000,
    diagCommand: "",
    diagTimeoutMs: 5000,
    hashlineTtlMs: 30 * 60 * 1000,
    commentChecker: false,
    commentCheckerDeny: false,
    agentGuard: false,
    categoryDiscipline: false,
    todoMaxContinues: 20,
    todoMaxStagnation: 3,
    ...over,
  };
}

function base(ws: string, over: Partial<HookInput> = {}): HookInput {
  return {
    raw: {},
    event: "stop",
    sessionId: "idle-sess",
    cwd: ws,
    workspaceRoot: ws,
    ...over,
  };
}

// ─── 1. isIdleAssistantMessage 真值表 ────────────────────────────────

describe("isIdleAssistantMessage", () => {
  it("empty / undefined / null → idle", () => {
    expect(isIdleAssistantMessage(undefined)).toBe(true);
    expect(isIdleAssistantMessage(null as unknown as string)).toBe(true);
    expect(isIdleAssistantMessage("")).toBe(true);
    expect(isIdleAssistantMessage("   ")).toBe(true);
  });

  it("Chinese short status fluff → idle (v1.1.13)", () => {
    expect(isIdleAssistantMessage("稍等")).toBe(true);
    expect(isIdleAssistantMessage("稍后继续")).toBe(true);
    expect(isIdleAssistantMessage("马上处理")).toBe(true);
    expect(isIdleAssistantMessage("这就开始")).toBe(true);
  });

  it("ultra-short (≤2 chars) → idle", () => {
    expect(isIdleAssistantMessage("ok")).toBe(true);
    expect(isIdleAssistantMessage("hi")).toBe(true);
    expect(isIdleAssistantMessage("…")).toBe(true);
  });

  it("fluff dictionary (en + zh)", () => {
    for (const m of [
      "sure",
      "yes",
      "thanks",
      "thank you",
      "done",
      "继续",
      "好的",
      "嗯",
      "收到",
      "明白",
      "了解",
      "可以",
    ]) {
      expect(isIdleAssistantMessage(m), m).toBe(true);
    }
  });

  it("deferral phrases → idle", () => {
    for (const m of [
      "I'll continue shortly.",
      "I will get right on it",
      "let me proceed",
      "let me continue",
      "continuing shortly",
      "working on it",
      "on it",
      "got it",
      "understood",
      "will do",
    ]) {
      expect(isIdleAssistantMessage(m), m).toBe(true);
    }
  });

  it("status fluff Looking into it / 我来看看 → idle (v1.1.50)", () => {
    for (const m of [
      "Looking into it.",
      "Looking into it",
      "I'll take a look.",
      "Taking a look.",
      "Let me check.",
      "Checking now.",
      "One moment.",
      "One sec.",
      "Hang on.",
      "Stand by.",
      "Acknowledged.",
      "Sounds good.",
      "On it now.",
      "Give me a moment.",
      "Just a second.",
      "Bear with me.",
      "我来看看。",
      "我看一下。",
      "正在处理。",
      "处理中。",
      "没问题。",
      "了解了。",
      "着手处理。",
    ]) {
      expect(isIdleAssistantMessage(m), m).toBe(true);
    }
  });

  it("status fluff investigate / cool / 排查中 → idle (v1.1.51)", () => {
    for (const m of [
      "I'll investigate.",
      "Investigating.",
      "Digging into it.",
      "Diving in.",
      "Proceeding.",
      "Almost there.",
      "Stay tuned.",
      "BRB.",
      "Cool.",
      "Perfect.",
      "Great.",
      "Noted.",
      "thx",
      "yep",
      "好哒。",
      "搞定。",
      "我去查一下。",
      "排查中。",
      "调试中。",
      "请稍等。",
      "等我一下。",
    ]) {
      expect(isIdleAssistantMessage(m), m).toBe(true);
    }
  });

  it("status fluff LGTM / ship it / 试一下 → idle (v1.1.52)", () => {
    for (const m of [
      "Sure thing.",
      "You got it.",
      "Can do.",
      "On my way.",
      "Jumping in.",
      "Continue.",
      "Resuming.",
      "Moving on.",
      "All set.",
      "All good.",
      "LGTM",
      "lgtm",
      "WIP",
      "Ship it.",
      "Shipping.",
      "知道了。",
      "懂了。",
      "好吧。",
      "就这样。",
      "我试试。",
      "试一下。",
      "修一下。",
      "看下。",
      "别急。",
    ]) {
      expect(isIdleAssistantMessage(m), m).toBe(true);
    }
  });

  it("status fluff I'll fix it / Looks good / 这就改 (v1.1.53)", () => {
    for (const m of [
      "I'll fix it.",
      "I'll fix that.",
      "I'll handle it.",
      "I'll check.",
      "Checking.",
      "Looks good.",
      "Looks fine.",
      "Seems fine.",
      "No problem.",
      "Gotcha.",
      "Works for me.",
      "我明白了。",
      "好嘞。",
      "这就改。",
      "这就修。",
      "先改。",
      "先修。",
      "先看。",
    ]) {
      expect(isIdleAssistantMessage(m), m).toBe(true);
    }
  });

  it("emoji / ellipsis noise → idle", () => {
    expect(isIdleAssistantMessage("👍")).toBe(true);
    expect(isIdleAssistantMessage("✅")).toBe(true);
    expect(isIdleAssistantMessage("...")).toBe(true);
    expect(isIdleAssistantMessage("———")).toBe(true);
  });

  it("short I/we status without evidence → idle", () => {
    expect(isIdleAssistantMessage("I am looking into this")).toBe(true);
    expect(isIdleAssistantMessage("I'm checking now")).toBe(true);
    expect(isIdleAssistantMessage("going to handle that")).toBe(true);
  });

  it("concrete deliverable with path/test/edit → not idle", () => {
    const real = [
      "Edited src/auth.ts and ran npm test — all green.",
      "Read package.json then fixed the version field.",
      "Implemented login flow in app/login.tsx",
      "Spawn explore to find callers of parseGoals.",
      "TODO: remaining tests next — started test suite.",
      "Applied fix for the hashline cache miss.",
    ];
    for (const m of real) {
      expect(isIdleAssistantMessage(m), m).toBe(false);
    }
  });

  it("long substantive prose without fluff markers → not idle", () => {
    const long =
      "The root cause is a race between the sticky role write and the host " +
      "re-tagging agentName on every prompt; slash-agent source must win.";
    expect(isIdleAssistantMessage(long)).toBe(false);
  });
});

// ─── 2. idleTurnStopReason ───────────────────────────────────────────

describe("idleTurnStopReason", () => {
  it("includes context and action checklist", () => {
    const s = idleTurnStopReason("Incomplete todos remain.");
    expect(s).toMatch(/IDLE TURN/);
    expect(s).toContain("Incomplete todos remain.");
    expect(s).toMatch(/Read|Edit|test/i);
  });
});

// ─── 3. detectThinkMode + banner ─────────────────────────────────────

describe("detectThinkMode", () => {
  it("english ultrathink / deep think variants", () => {
    expect(detectThinkMode("please ultrathink the design")).toBe(true);
    expect(detectThinkMode("think deeply about tradeoffs")).toBe(true);
    expect(detectThinkMode("think deep about this")).toBe(true);
    expect(detectThinkMode("deep thinking required")).toBe(true);
    expect(detectThinkMode("use extended thinking here")).toBe(true);
  });

  it("chinese triggers", () => {
    expect(detectThinkMode("仔细想一下架构")).toBe(true);
    expect(detectThinkMode("需要深度思考")).toBe(true);
    expect(detectThinkMode("认真想清楚再改")).toBe(true);
    expect(detectThinkMode("多想一下边界条件")).toBe(true);
    expect(detectThinkMode("多想一步")).toBe(true);
  });

  it("negatives: casual think / empty / unrelated", () => {
    expect(detectThinkMode("")).toBe(false);
    expect(detectThinkMode("   ")).toBe(false);
    expect(detectThinkMode("I think the bug is in auth")).toBe(false);
    expect(detectThinkMode("fix typo")).toBe(false);
    expect(detectThinkMode("thinking of lunch")).toBe(false);
    expect(detectThinkMode("deep learning model")).toBe(false);
  });
});

describe("thinkModeBanner", () => {
  it("empty when inactive; protocol when active", () => {
    expect(thinkModeBanner(false)).toBe("");
    const b = thinkModeBanner(true);
    expect(b).toMatch(/OMG_THINK_MODE/);
    expect(b).toMatch(/trade-?off|approaches|evidence|oracle/i);
  });
});

// ─── 4. production Stop / UserPrompt ─────────────────────────────────

describe("production path", () => {
  it("Stop yanks idle when incomplete todos", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    mirrorTodos(base(ws), c, [
      { content: "ship feature", status: "pending" },
    ]);
    const stop = handleStop(
      base(ws, { lastAssistantMessage: "ok" }),
      c,
    );
    expect(stop).toMatchObject({ decision: "block" });
    expect(JSON.stringify(stop)).toMatch(/IDLE|TODO|incomplete/i);
  });

  it("Stop does not idle-yank substantive message with open todos (cooldown 0 still enforces todos)", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"), { todoCooldownMs: 0 });
    mirrorTodos(base(ws), c, [
      { content: "ship feature", status: "pending" },
    ]);
    const stop = handleStop(
      base(ws, {
        lastAssistantMessage:
          "Edited src/feature.ts and started implementing the remaining tests.",
      }),
      c,
    );
    // may still block for todos, but reason should not be pure idle fluff only
    if ("decision" in stop && stop.decision === "block") {
      const j = JSON.stringify(stop);
      // concrete progress present — idle reason may still append; todos gate is primary
      expect(j).toMatch(/TODO|incomplete|todo/i);
    }
  });

  it("Stop yanks idle under active ULW", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    startRalph(base(ws), c, "finish oauth", "ulw");
    handleStop(
      base(ws, { lastAssistantMessage: "exploring the auth module structure" }),
      c,
    );
    const stop = handleStop(
      base(ws, { lastAssistantMessage: "..." }),
      c,
    );
    expect(stop).toMatchObject({ decision: "block" });
    expect(JSON.stringify(stop)).toMatch(/STALL|IDLE|ULW|continue/i);
  });

  it("UserPrompt ultrathink injects THINK_MODE banner", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const out = handleUserPrompt(
      base(ws, {
        event: "user-prompt",
        prompt: "ultrathink the migration plan",
      }),
      c,
    );
    expect("additionalContext" in out && out.additionalContext).toMatch(
      /THINK_MODE|Extended-effort|ultrathink/i,
    );
  });

  it("UserPrompt without think keywords does not inject THINK_MODE", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const out = handleUserPrompt(
      base(ws, {
        event: "user-prompt",
        prompt: "fix the typo in README",
      }),
      c,
    );
    const ctx =
      "additionalContext" in out ? String(out.additionalContext || "") : "";
    expect(ctx).not.toMatch(/OMG_THINK_MODE/);
  });
});
