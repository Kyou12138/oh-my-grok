/**
 * prometheus.ts dedicated suite (MAGI v0.17) —
 * plan-review gate / detectPlanCommand / startWorkFromPlan / planModeDeny.
 * magi-spiral-v09 covers 4 happy/deny paths; this file locks the full matrix.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { handlePostToolPlan } from "../src/events/post-tool.js";
import { handleUserPrompt } from "../src/events/user-prompt.js";
import { handlePreToolUse } from "../src/events/pre-tool-use.js";
import type { EnvConfig, HookInput } from "../src/protocol/types.js";
import {
  activateHostPlanMode,
  detectPlanCommand,
  endPlanMode,
  isHostEnterPlanTool,
  isHostExitPlanTool,
  loadPlanMode,
  planFileHasReview,
  planModeContext,
  planModeDeny,
  planReviewDenyReason,
  startPlanMode,
  startWorkFromPlan,
} from "../src/features/prometheus.js";
import { loadBoulder } from "../src/features/todo-boulder.js";

const tmpRoots: string[] = [];

function tmpWorkspace(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "omg-prom-"));
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
    planMode: true,
    hashline: false,
    diagEnforce: false,
    hardOrchestration: false,
    maxRalphIter: 10,
    todoCooldownMs: 5_000,
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
    event: "user-prompt",
    sessionId: "prom-sess",
    cwd: ws,
    workspaceRoot: ws,
    ...over,
  };
}

function writePlan(planPath: string, body: string): void {
  fs.mkdirSync(path.dirname(planPath), { recursive: true });
  fs.writeFileSync(planPath, body, "utf8");
}

// ─── 1. detectPlanCommand ────────────────────────────────────────────

describe("detectPlanCommand", () => {
  it("/plan alone → plan + untitled topic", () => {
    expect(detectPlanCommand("/plan")).toEqual({
      action: "plan",
      topic: "untitled plan",
    });
  });

  it('/plan "oauth" and /plan oauth → topic', () => {
    expect(detectPlanCommand('/plan "oauth"')).toEqual({
      action: "plan",
      topic: "oauth",
    });
    expect(detectPlanCommand("/plan oauth feature")).toEqual({
      action: "plan",
      topic: "oauth feature",
    });
  });

  it("/prometheus aliases /plan", () => {
    expect(detectPlanCommand("/prometheus")).toEqual({
      action: "plan",
      topic: "untitled plan",
    });
    expect(detectPlanCommand("/prometheus ship login")).toEqual({
      action: "plan",
      topic: "ship login",
    });
  });

  it("/start-work → start-work with empty topic", () => {
    expect(detectPlanCommand("/start-work")).toEqual({
      action: "start-work",
      topic: "",
    });
    expect(detectPlanCommand("/start-work now")).toEqual({
      action: "start-work",
      topic: "",
    });
  });

  it("non-command prose → null", () => {
    expect(detectPlanCommand("please plan the oauth flow")).toEqual({
      action: null,
      topic: "",
    });
    expect(detectPlanCommand("start work tomorrow")).toEqual({
      action: null,
      topic: "",
    });
  });

  it("case-insensitive slash commands", () => {
    expect(detectPlanCommand("/PLAN Foo").action).toBe("plan");
    expect(detectPlanCommand("/Start-Work").action).toBe("start-work");
    expect(detectPlanCommand("/PROMETHEUS bar").topic).toBe("bar");
  });
});

// ─── 2. planFileHasReview 真值表 ─────────────────────────────────────

describe("planFileHasReview", () => {
  it("missing path / missing file → false", () => {
    expect(planFileHasReview(undefined)).toBe(false);
    expect(planFileHasReview("")).toBe(false);
    expect(planFileHasReview(path.join(os.tmpdir(), "no-such-omg-plan.md"))).toBe(
      false,
    );
  });

  it("stock startPlanMode template is NOT review evidence", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const pm = startPlanMode(base(ws), c, "stock");
    expect(planFileHasReview(pm.planFile!)).toBe(false);
  });

  it("unchecked Metis/Momus/VERDICT prose must NOT pass", () => {
    const ws = tmpWorkspace();
    const f = path.join(ws, "p.md");
    writePlan(
      f,
      [
        "## Review",
        "- [ ] Metis gap analysis (spawn metis first)",
        "- [ ] Momus plan review (spawn momus; then record VERDICT: PASS)",
        "* [ ] review incomplete",
        "+ [ ] 评审未完成",
      ].join("\n"),
    );
    expect(planFileHasReview(f)).toBe(false);
  });

  it("checked Metis / Momus / review / 评审 pass", () => {
    const ws = tmpWorkspace();
    for (const line of [
      "- [x] Metis gap check done",
      "* [X] Momus approved",
      "+ [x] review signed off",
      "- [x] 评审通过",
    ]) {
      const f = path.join(ws, `ok-${Math.random().toString(36).slice(2)}.md`);
      writePlan(f, `## Review\n${line}\n`);
      expect(planFileHasReview(f), line).toBe(true);
    }
  });

  it("checked step without review keywords does NOT pass", () => {
    const ws = tmpWorkspace();
    const f = path.join(ws, "steps.md");
    writePlan(f, "## Steps\n- [x] design\n- [x] implement\n");
    expect(planFileHasReview(f)).toBe(false);
  });

  it("VERDICT: PASS line-start (plain or bold) passes", () => {
    const ws = tmpWorkspace();
    const a = path.join(ws, "v1.md");
    const b = path.join(ws, "v2.md");
    writePlan(a, "## Momus\nVERDICT: PASS\n");
    writePlan(b, "## Momus\n**VERDICT: PASS** — ready\n");
    expect(planFileHasReview(a)).toBe(true);
    expect(planFileHasReview(b)).toBe(true);
  });

  it("mid-sentence VERDICT: PASS instructional prose does NOT pass", () => {
    const ws = tmpWorkspace();
    const f = path.join(ws, "prose.md");
    writePlan(
      f,
      [
        "Required before start-work.",
        "After real review append a Momus result line that starts with VERDICT followed by colon and PASS.",
        "Do not treat this paragraph as VERDICT: PASS evidence.",
      ].join("\n"),
    );
    expect(planFileHasReview(f)).toBe(false);
  });

  it("VERDICT: FAIL does not count", () => {
    const ws = tmpWorkspace();
    const f = path.join(ws, "fail.md");
    writePlan(f, "VERDICT: FAIL\n- [ ] fix gaps\n");
    expect(planFileHasReview(f)).toBe(false);
  });

  it("CRLF line endings still detect checked review", () => {
    const ws = tmpWorkspace();
    const f = path.join(ws, "crlf.md");
    writePlan(f, "## Review\r\n- [x] Metis ok\r\n");
    expect(planFileHasReview(f)).toBe(true);
  });
});

// ─── 3. startWorkFromPlan 失败/成功矩阵 ──────────────────────────────

describe("startWorkFromPlan", () => {
  it("no active plan → ok=false + No active plan", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const r = startWorkFromPlan(base(ws), c);
    expect(r.ok).toBe(false);
    expect(r.planPath).toBe("");
    expect(r.reason).toMatch(/No active plan|\/plan/i);
    expect(loadBoulder(base(ws), c)).toBeNull();
  });

  it("active plan without review → PLAN_REVIEW deny, no boulder", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    const pm = startPlanMode(input, c, "feat");
    const r = startWorkFromPlan(input, c);
    expect(r.ok).toBe(false);
    expect(r.planPath).toBe(pm.planFile);
    expect(r.reason).toMatch(/PLAN_REVIEW|Metis|Momus/i);
    expect(loadBoulder(input, c)).toBeNull();
    // plan mode stays active so user can still edit
    expect(loadPlanMode(input, c).active).toBe(true);
  });

  it("review evidence → ok, activates boulder, ends plan mode", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    const pm = startPlanMode(input, c, "oauth");
    writePlan(
      pm.planFile!,
      ["# Plan: oauth", "## Review", "- [x] Metis gap check", "VERDICT: PASS"].join(
        "\n",
      ),
    );
    const r = startWorkFromPlan(input, c);
    expect(r.ok).toBe(true);
    expect(r.planPath).toBe(pm.planFile);
    const b = loadBoulder(input, c);
    expect(b?.active).toBe(true);
    expect(b?.planPath).toBe(pm.planFile);
    expect(b?.title).toBe("oauth");
    expect(loadPlanMode(input, c).active).toBe(false);
  });

  it("planPath points to deleted file → deny (no review)", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    const pm = startPlanMode(input, c, "gone");
    fs.unlinkSync(pm.planFile!);
    const r = startWorkFromPlan(input, c);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/PLAN_REVIEW|review/i);
  });
});

// ─── 4. planReviewDenyReason / planModeContext 文案 ──────────────────

describe("planReviewDenyReason + planModeContext", () => {
  it("deny reason names Metis/Momus chain", () => {
    const s = planReviewDenyReason("/tmp/x.md");
    expect(s).toMatch(/PLAN_REVIEW/);
    expect(s).toMatch(/metis/i);
    expect(s).toMatch(/momus/i);
    expect(s).toMatch(/\/start-work/);
    expect(s).toContain("/tmp/x.md");
  });

  it("context empty when inactive; full when active", () => {
    expect(planModeContext({ schemaVersion: 1, active: false, updatedAt: "" })).toBe(
      "",
    );
    const ctx = planModeContext({
      schemaVersion: 1,
      active: true,
      topic: "oauth",
      planFile: "/p/plan.md",
      updatedAt: new Date().toISOString(),
    });
    expect(ctx).toMatch(/OMG_PROMETHEUS/);
    expect(ctx).toMatch(/oauth/);
    expect(ctx).toMatch(/\/p\/plan\.md/);
    expect(ctx).toMatch(/Metis|Momus|start-work/i);
  });
});

// ─── 5. planModeDeny 写路径 ──────────────────────────────────────────

describe("planModeDeny", () => {
  it("inactive or planMode=false → null", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    expect(planModeDeny(base(ws), cfg(data, { planMode: false }))).toBeNull();
    expect(planModeDeny(base(ws), cfg(data))).toBeNull();
  });

  it("active plan-mode blocks writes outside .omg/plans/", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    startPlanMode(input, c, "lock");
    const denied = planModeDeny(
      {
        ...input,
        event: "pre-tool-use",
        toolName: "Write",
        toolInput: { path: path.join(ws, "src", "a.ts") },
      },
      c,
    );
    expect(denied).toMatch(/plan-mode|Only writes under \.omg\/plans/i);
  });

  it("allows writes under .omg/plans/ and plan-mode.json", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    const pm = startPlanMode(input, c, "lock");
    expect(
      planModeDeny(
        {
          ...input,
          toolInput: { path: pm.planFile! },
        },
        c,
      ),
    ).toBeNull();
    expect(
      planModeDeny(
        {
          ...input,
          toolInput: { file_path: path.join(ws, ".omg", "plans", "extra.md") },
        },
        c,
      ),
    ).toBeNull();
  });

  it("missing path while active → deny with path hint", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    startPlanMode(input, c, "lock");
    const denied = planModeDeny(
      { ...input, toolName: "Write", toolInput: {} },
      c,
    );
    expect(denied).toMatch(/Specify a path under \.omg\/plans/i);
  });

  it("endPlanMode clears deny", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    startPlanMode(input, c, "lock");
    endPlanMode(input, c);
    expect(
      planModeDeny(
        {
          ...input,
          toolInput: { path: path.join(ws, "src", "a.ts") },
        },
        c,
      ),
    ).toBeNull();
  });
});

// ─── 6. UserPrompt / PreTool 生产路径 ────────────────────────────────

describe("UserPrompt + PreTool production path", () => {
  it("/plan injects prometheus context", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const out = handleUserPrompt(base(ws, { prompt: '/plan "billing"' }), c);
    expect("additionalContext" in out && out.additionalContext).toMatch(
      /PROMETHEUS|PLAN MODE|billing/i,
    );
    expect(loadPlanMode(base(ws), c).active).toBe(true);
  });

  it("/start-work without review surfaces PLAN_REVIEW via UserPrompt", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    handleUserPrompt(base(ws, { prompt: "/plan gate-test" }), c);
    const out = handleUserPrompt(base(ws, { prompt: "/start-work" }), c);
    expect("additionalContext" in out && out.additionalContext).toMatch(
      /PLAN_REVIEW|Metis|Momus/i,
    );
    expect(loadBoulder(base(ws), c)).toBeNull();
  });

  it("/start-work after checked review activates boulder via UserPrompt", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    handleUserPrompt(base(ws, { prompt: "/plan ready" }), c);
    const pm = loadPlanMode(base(ws), c);
    writePlan(
      pm.planFile!,
      "# Plan\n## Review\n- [x] Momus review complete\n",
    );
    const out = handleUserPrompt(base(ws, { prompt: "/start-work" }), c);
    expect("additionalContext" in out && out.additionalContext).toMatch(
      /start-work|boulder|Atlas|execution/i,
    );
    expect(loadBoulder(base(ws), c)?.active).toBe(true);
  });

  it("PreTool plan-mode blocks Write outside plans while active", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"), { planMode: true, hashline: false });
    handleUserPrompt(base(ws, { prompt: "/plan pretool" }), c);
    const r = handlePreToolUse(
      base(ws, {
        event: "pre-tool-use",
        toolName: "Write",
        toolInput: {
          path: path.join(ws, "src", "leak.ts"),
          contents: "export const x = 1;\n",
        },
      }),
      c,
    );
    expect(r.exitCode).toBe(2);
    expect(JSON.stringify(r)).toMatch(/plan-mode|\.omg\/plans/i);
  });
});

// ─── 7. Host enter_plan_mode / exit_plan_mode (v1.1.8) ────────────────

describe("host enter_plan_mode / exit_plan_mode sync", () => {
  it("detects host tool name variants", () => {
    expect(isHostEnterPlanTool("enter_plan_mode")).toBe(true);
    expect(isHostEnterPlanTool("EnterPlanMode")).toBe(true);
    expect(isHostExitPlanTool("exit_plan_mode")).toBe(true);
    expect(isHostExitPlanTool("ExitPlanMode")).toBe(true);
    expect(isHostEnterPlanTool("Write")).toBe(false);
  });

  it("activateHostPlanMode arms planModeDeny without new plan file", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    const st = activateHostPlanMode(input, c);
    expect(st.active).toBe(true);
    expect(loadPlanMode(input, c).active).toBe(true);
    const denied = planModeDeny(
      {
        ...input,
        toolName: "Write",
        toolInput: { path: path.join(ws, "src", "x.ts"), contents: "1\n" },
      },
      c,
    );
    expect(denied).toMatch(/plan-mode|\.omg\/plans/i);
    // second call idempotent
    expect(activateHostPlanMode(input, c).active).toBe(true);
  });

  it("PostTool enter then exit production path", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const enter = handlePostToolPlan(
      base(ws, {
        event: "post-tool-plan",
        toolName: "enter_plan_mode",
        toolInput: {},
      }),
      c,
    );
    expect(JSON.stringify(enter)).toMatch(/enter_plan_mode|plan-mode|PROMETHEUS/i);
    expect(loadPlanMode(base(ws), c).active).toBe(true);
    const r = handlePreToolUse(
      base(ws, {
        event: "pre-tool-use",
        toolName: "Write",
        toolInput: {
          path: path.join(ws, "leak.ts"),
          contents: "export {}\n",
        },
      }),
      c,
    );
    expect(r.exitCode).toBe(2);
    handlePostToolPlan(
      base(ws, {
        event: "post-tool-plan",
        toolName: "exit_plan_mode",
        toolInput: {},
      }),
      c,
    );
    expect(loadPlanMode(base(ws), c).active).toBe(false);
    const r2 = handlePreToolUse(
      base(ws, {
        event: "pre-tool-use",
        toolName: "Write",
        toolInput: {
          path: path.join(ws, "ok.ts"),
          contents: "export {}\n",
        },
      }),
      c,
    );
    expect(r2.exitCode).toBe(0);
  });
});
