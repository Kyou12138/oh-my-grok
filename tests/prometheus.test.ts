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
  countPlanTaskCheckboxes,
  isPlanModePlanOnlyWrite,
  planFileHasReview,
  planFormatDenyReason,
  planModeContext,
  planModeDeny,
  planReviewDenyReason,
  prometheusRoleDeny,
  startPlanMode,
  startWorkFromPlan,
} from "../src/features/prometheus.js";
import { incompleteTodos, loadBoulder, loadTodosMirror } from "../src/features/todo-boulder.js";
import { handlePreToolUse } from "../src/events/pre-tool-use.js";
import { refreshCatalog } from "../src/features/skill-gate.js";

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

function rawPath(...parts: string[]): string {
  return parts.join(path.sep);
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

  it("review evidence + task checkboxes → ok, activates boulder, ends plan mode", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    const pm = startPlanMode(input, c, "oauth");
    writePlan(
      pm.planFile!,
      [
        "# Plan: oauth",
        "## Steps",
        "- [ ] 1. Implement token refresh",
        "- [ ] 2. Add regression tests",
        "## Review",
        "- [x] Metis gap check",
        "VERDICT: PASS",
      ].join("\n"),
    );
    const r = startWorkFromPlan(input, c);
    expect(r.ok).toBe(true);
    expect(r.planPath).toBe(pm.planFile);
    const b = loadBoulder(input, c);
    expect(b?.active).toBe(true);
    expect(b?.planPath).toBe(pm.planFile);
    expect(b?.title).toBe("oauth");
    expect(loadPlanMode(input, c).active).toBe(false);
    // omo #6066: plan tasks seeded as todos (Goal-like continuation)
    const todos = loadTodosMirror(input, c);
    expect(todos).toHaveLength(2);
    expect(incompleteTodos(input, c).map((t) => t.content)).toEqual([
      "1. Implement token refresh",
      "2. Add regression tests",
    ]);
  });

  it("review only, zero task checkboxes → PLAN_FORMAT deny (omo #6094)", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    const pm = startPlanMode(input, c, "prose");
    // omo #6094 shape: review passes but Todos are prose headings, not - [ ] rows
    writePlan(
      pm.planFile!,
      [
        "# Plan: prose",
        "## Todos",
        "1. **Implement settlement flow**",
        "2. **Add regression coverage**",
        "## Review",
        "- [x] Momus approved",
        "VERDICT: PASS",
      ].join("\n"),
    );
    const r = startWorkFromPlan(input, c);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/PLAN_FORMAT|checkbox|task row/i);
    expect(loadBoulder(input, c)).toBeNull();
    expect(loadPlanMode(input, c).active).toBe(true);
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

// ─── 3b. countPlanTaskCheckboxes / plan format (omo #6094) ───────────

describe("countPlanTaskCheckboxes (omo #6094 parity)", () => {
  it("empty / missing → 0", () => {
    expect(countPlanTaskCheckboxes(undefined)).toBe(0);
    expect(countPlanTaskCheckboxes("")).toBe(0);
    expect(countPlanTaskCheckboxes(path.join(os.tmpdir(), "no-omg-plan.md"))).toBe(0);
  });

  it("empty placeholder - [ ] does not count; labeled tasks do", () => {
    const ws = tmpWorkspace();
    const f = path.join(ws, "tasks.md");
    writePlan(
      f,
      [
        "## Steps",
        "- [ ] ",
        "- [ ]",
        "- [ ] 1. Real work item",
        "* [x] 2. Done item",
        "+ [ ] F1. Final verify",
        "## Review",
        "- [x] Metis gap analysis",
        "- [ ] Momus plan review",
      ].join("\n"),
    );
    // Review section excluded; 3 labeled steps outside Review
    expect(countPlanTaskCheckboxes(f)).toBe(3);
  });

  it("prose-only Todos section → 0", () => {
    const ws = tmpWorkspace();
    const f = path.join(ws, "prose.md");
    writePlan(
      f,
      ["## Todos", "1. **Backend** Implement", "## Final verification wave", "- F1 - audit"].join(
        "\n",
      ),
    );
    expect(countPlanTaskCheckboxes(f)).toBe(0);
  });

  it("planFormatDenyReason names grammar", () => {
    const s = planFormatDenyReason("/p/plan.md");
    expect(s).toMatch(/PLAN_FORMAT/);
    expect(s).toMatch(/- \[ \]/);
    expect(s).toContain("/p/plan.md");
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

describe("prometheusRoleDeny + plan-only skill skip (v1.1.26)", () => {
  it("prometheus role cannot Write src/", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"), { agentGuard: true, hashline: false });
    const deny = prometheusRoleDeny(
      base(ws, {
        agentName: "prometheus",
        toolName: "Write",
        toolInput: {
          path: path.join(ws, "src", "app.ts"),
          contents: "export {}\n",
        },
      }),
      c,
      "prometheus",
    );
    expect(deny).toMatch(/PROMETHEUS_ROLE|plan-only|plans/i);
  });

  it("prometheus role may Write .omg/plans/", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"), { agentGuard: true });
    const plan = path.join(ws, ".omg", "plans", "x.md");
    fs.mkdirSync(path.dirname(plan), { recursive: true });
    expect(
      prometheusRoleDeny(
        base(ws, {
          agentName: "prometheus",
          toolName: "Write",
          toolInput: { path: plan, contents: "# plan\n" },
        }),
        c,
        "prometheus",
      ),
    ).toBeNull();
  });

  it("isPlanModePlanOnlyWrite true only for plan paths while plan-mode active", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    expect(isPlanModePlanOnlyWrite(input, c)).toBe(false);
    const pm = startPlanMode(input, c, "topic");
    expect(
      isPlanModePlanOnlyWrite(
        {
          ...input,
          toolInput: { path: pm.planFile!, contents: "# x\n" },
        },
        c,
      ),
    ).toBe(true);
    expect(
      isPlanModePlanOnlyWrite(
        {
          ...input,
          toolInput: { path: path.join(ws, "src", "x.ts"), contents: "x\n" },
        },
        c,
      ),
    ).toBe(false);
  });

  it("PreTool: plan-mode plan Write skips Skill Gate even with TDD last prompt", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data, {
      skillGate: true,
      hashline: false,
      agentGuard: false,
      planMode: true,
    });
    const input = base(ws);
    // ensure catalog non-empty so skill gate would otherwise fire
    refreshCatalog(input, c);
    const pm = startPlanMode(input, c, "tdd plan");
    // last prompt with TDD intent (would require skill if not skipped)
    const lastPromptPath = path.join(data, "prom-sess", "last-prompt.json");
    fs.mkdirSync(path.dirname(lastPromptPath), { recursive: true });
    fs.writeFileSync(
      lastPromptPath,
      JSON.stringify({
        schemaVersion: 1,
        prompt: "implement with TDD and unit tests",
        updatedAt: new Date().toISOString(),
      }),
      "utf8",
    );
    const r = handlePreToolUse(
      {
        ...input,
        event: "pre-tool-use",
        toolName: "Write",
        toolInput: {
          path: pm.planFile!,
          contents: "# Plan\n- [ ] 1. Do work\n",
        },
      },
      c,
    );
    expect(r.exitCode).toBe(0);
    expect(r.output).toMatchObject({ decision: "allow" });
  });
});

describe("canonical plan path boundary", () => {
  it("allows relative, absolute, and custom-state plan targets", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    startPlanMode(input, c, "valid paths");

    for (const target of [
      path.join(".omg", "plans", "relative.md"),
      path.join(ws, ".omg", "plans", "absolute.md"),
    ]) {
      expect(planModeDeny({ ...input, toolInput: { path: target } }, c)).toBeNull();
      expect(
        prometheusRoleDeny(
          { ...input, toolInput: { path: target } },
          c,
          "prometheus",
        ),
      ).toBeNull();
    }

    const relativeCustom = cfg(path.join(ws, "relative-pdata"), {
      stateDirName: ".custom",
    });
    const relativeInput = base(ws, { sessionId: "relative-state" });
    const relativePm = startPlanMode(relativeInput, relativeCustom, "relative state");
    expect(
      planModeDeny(
        { ...relativeInput, toolInput: { path: relativePm.planFile! } },
        relativeCustom,
      ),
    ).toBeNull();

    const absoluteRoot = path.join(tmpWorkspace(), "custom-state");
    const absoluteCustom = cfg(path.join(ws, "absolute-pdata"), {
      stateDirName: absoluteRoot,
    });
    const absoluteInput = base(ws, { sessionId: "absolute-state" });
    const absolutePm = startPlanMode(absoluteInput, absoluteCustom, "absolute state");
    expect(
      planModeDeny(
        { ...absoluteInput, toolInput: { path: absolutePm.planFile! } },
        absoluteCustom,
      ),
    ).toBeNull();
  });

  it("allows the first plan target before plansDir exists", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    const firstPlan = path.join(ws, ".omg", "plans", "first.md");

    expect(fs.existsSync(path.dirname(firstPlan))).toBe(false);
    expect(
      prometheusRoleDeny(
        { ...input, toolInput: { path: firstPlan, contents: "# first\n" } },
        c,
        "prometheus",
      ),
    ).toBeNull();
  });

  it("rejects every lexical escape in both denies and the skill skip", () => {
    const ws = tmpWorkspace();
    const outside = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    startPlanMode(input, c, "invalid paths");

    const otherRoot =
      process.platform === "win32"
        ? path.parse(ws).root.toLowerCase().startsWith("c:")
          ? "D:\\"
          : "C:\\"
        : path.parse(outside).root;
    const invalid = [
      rawPath(ws, ".omg", "plans", "..", "..", "src", "app.ts"),
      path.join(outside, ".omg", "plans", "external.md"),
      path.join(ws, ".omg", "plans-evil", "sibling.md"),
      path.join(ws, "src", "plan-mode.json"),
      path.join(otherRoot, "outside", ".omg", "plans", "cross-root.md"),
    ];

    for (const target of invalid) {
      const toolInput = { path: target, contents: "# plan\n" };
      expect(planModeDeny({ ...input, toolInput }, c)).toMatch(/plan-mode|plans/i);
      expect(
        prometheusRoleDeny({ ...input, toolInput }, c, "prometheus"),
      ).toMatch(/PROMETHEUS_ROLE|plan-only/i);
      expect(isPlanModePlanOnlyWrite({ ...input, toolInput }, c)).toBe(false);
    }
  });

  it("rejects a plan descendant link that escapes the boundary", () => {
    const ws = tmpWorkspace();
    const outside = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    startPlanMode(input, c, "link escape");
    const link = path.join(ws, ".omg", "plans", "escape");
    fs.symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
    const toolInput = { path: path.join(link, "outside.md"), contents: "# no\n" };

    expect(planModeDeny({ ...input, toolInput }, c)).toMatch(/plan-mode|plans/i);
    expect(prometheusRoleDeny({ ...input, toolInput }, c, "prometheus")).toMatch(
      /PROMETHEUS_ROLE|plan-only/i,
    );
    expect(isPlanModePlanOnlyWrite({ ...input, toolInput }, c)).toBe(false);
  });

  it("rejects a mixed MultiEdit batch", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    const pm = startPlanMode(input, c, "batch");
    const escaped = rawPath(ws, ".omg", "plans", "..", "..", "src", "app.ts");
    const toolInput = {
      edits: [
        { path: pm.planFile!, old_string: "# Plan", new_string: "# Updated" },
        { path: escaped, old_string: "old", new_string: "new" },
      ],
    };

    expect(planModeDeny({ ...input, toolInput }, c)).toMatch(/plan-mode|plans/i);
    expect(prometheusRoleDeny({ ...input, toolInput }, c, "prometheus")).toMatch(
      /PROMETHEUS_ROLE|plan-only/i,
    );
    expect(isPlanModePlanOnlyWrite({ ...input, toolInput }, c)).toBe(false);
  });
});

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
      "# Plan\n## Steps\n- [ ] 1. Ship ready\n## Review\n- [x] Momus review complete\n",
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
