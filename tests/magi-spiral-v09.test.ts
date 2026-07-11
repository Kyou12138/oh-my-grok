/**
 * MAGI spiral v0.9 — plan-review gate + stronger comment-checker aggregation.
 * Drives shipped handlers only.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { handlePostToolWrite } from "../src/events/post-tool.js";
import { handlePreToolUse } from "../src/events/pre-tool-use.js";
import { handleStop } from "../src/events/stop.js";
import { handleUserPrompt } from "../src/events/user-prompt.js";
import { findCommentSlop } from "../src/features/comment-checker.js";
import { planFileHasReview, startPlanMode, startWorkFromPlan } from "../src/features/prometheus.js";
import { loadBoulder } from "../src/features/todo-boulder.js";
import type { EnvConfig, HookInput } from "../src/protocol/types.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmpRoots: string[] = [];

function tmpWorkspace(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "omg-v09-"));
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
    todoAbortWindowMs: 3000,
    diagCommand: "",
    diagTimeoutMs: 5000,
    hashlineTtlMs: 30 * 60 * 1000,
    commentChecker: true,
    commentCheckerDeny: false,
    agentGuard: false,
    ...over,
  };
}

function base(ws: string, over: Partial<HookInput> = {}): HookInput {
  return {
    raw: {},
    event: "user-prompt",
    sessionId: "v09-sess",
    cwd: ws,
    workspaceRoot: ws,
    ...over,
  };
}

describe("plan-review gate", () => {
  it("default startPlanMode template does NOT pass review (unchecked prose)", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data);
    const input = base(ws);
    const pm = startPlanMode(input, c, "oauth");
    // Must fail on stock template — no rewrite
    expect(planFileHasReview(pm.planFile!)).toBe(false);
    const r = startWorkFromPlan(input, c);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/PLAN_REVIEW|review|Metis|Momus/i);
    expect(loadBoulder(input, c)).toBeNull();
  });

  it("rejects start-work when plan lacks review section", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data);
    const input = base(ws);
    const pm = startPlanMode(input, c, "oauth");
    // Template may include Review heading but unchecked — still need evidence
    // Write a plan without any review markers
    fs.writeFileSync(
      pm.planFile!,
      "# Plan\n\n## Goal\n\nDo it\n\n## Steps\n\n- [x] step\n",
      "utf8",
    );
    expect(planFileHasReview(pm.planFile!)).toBe(false);
    const r = startWorkFromPlan(input, c);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/review|Metis|Momus/i);
    expect(loadBoulder(input, c)).toBeNull();
  });

  it("allows start-work when plan has review evidence", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data);
    const input = base(ws);
    const pm = startPlanMode(input, c, "oauth");
    fs.writeFileSync(
      pm.planFile!,
      [
        "# Plan: oauth",
        "## Goal",
        "oauth",
        "## Steps",
        "- [x] design",
        "## Review",
        "- [x] Metis gap check done",
        "- [x] Momus VERDICT: PASS",
      ].join("\n"),
      "utf8",
    );
    expect(planFileHasReview(pm.planFile!)).toBe(true);
    const r = startWorkFromPlan(input, c);
    expect(r.ok).toBe(true);
    expect(loadBoulder(input, c)?.active).toBe(true);
  });

  it("UserPrompt /start-work surfaces PLAN_REVIEW gate when missing", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data);
    handleUserPrompt(base(ws, { prompt: '/plan "feat"' }), c);
    // strip review from created plan if present
    const plans = path.join(ws, ".omg", "plans");
    const f = fs.readdirSync(plans).find((n) => n.endsWith(".md"));
    expect(f).toBeTruthy();
    fs.writeFileSync(path.join(plans, f!), "# Plan\n\n## Goal\nx\n", "utf8");
    const out = handleUserPrompt(base(ws, { prompt: "/start-work" }), c);
    expect("additionalContext" in out && out.additionalContext).toMatch(
      /PLAN_REVIEW|Metis|Momus|review/i,
    );
    expect(loadBoulder(base(ws), c)).toBeNull();
  });
});

describe("stronger comment-checker", () => {
  it("flags Chinese restating and implements/handles slop", () => {
    const hits = findCommentSlop(
      [
        "// 这个函数用于计算总和",
        "function sum() {}",
        "// Implements the login flow",
        "export function login() {}",
        "// Handles the request payload",
        "export function handle() {}",
      ].join("\n"),
      "x.ts",
    );
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });

  it("session aggregation Stop blocks once after repeated slop writes", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data, { commentChecker: true, commentCheckerDeny: false });
    const slop = "// This function calculates the total\nexport const t = 1;\n";
    for (let i = 0; i < 3; i++) {
      handlePostToolWrite(
        base(ws, {
          event: "post-tool-write",
          toolName: "Write",
          toolInput: { path: path.join(ws, `s${i}.ts`), contents: slop },
        }),
        c,
      );
    }
    const stop = handleStop(
      base(ws, { event: "stop", lastAssistantMessage: "wrote helpers" }),
      c,
    );
    expect(stop).toMatchObject({ decision: "block" });
    expect(JSON.stringify(stop)).toMatch(/COMMENT|slop|AI/i);
    // second stop should not re-block forever for same aggregate (soft once)
    const stop2 = handleStop(
      base(ws, { event: "stop", lastAssistantMessage: "cleaned comments" }),
      c,
    );
    // may be empty if no other gates
    if ("decision" in stop2 && stop2.decision === "block") {
      expect(JSON.stringify(stop2)).not.toMatch(/COMMENT_AGGREGATE|already prompted/i);
    }
  });

  it("hard deny still works for Chinese slop when commentCheckerDeny", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data, { commentChecker: true, commentCheckerDeny: true, hashline: false });
    const r = handlePreToolUse(
      base(ws, {
        event: "pre-tool-use",
        toolName: "Write",
        toolInput: {
          path: path.join(ws, "c.ts"),
          contents: "// 这个方法处理登录逻辑\nexport function login() {}\n",
        },
      }),
      c,
    );
    expect(r.exitCode).toBe(2);
  });
});
