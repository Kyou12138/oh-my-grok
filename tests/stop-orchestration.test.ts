/**
 * stop orchestration priority (MAGI spiral 7, v0.14, 组G3b)
 *
 * 锁定 handleStop 的门禁优先级：
 *   段0 isStopPaused → 段1 ralph → 段2 boulder → 段2.5 category-discipline
 *   → 段2.6 spawn-followthrough → 段3 todos → 段4 diagnostics
 *   → 段5 plan-checkboxes → 段6 comment-aggregate
 *
 * 全部直驱 handleStop,状态隔离:每 it 独立 workspaceRoot + pluginData + sessionId。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { handleStop } from "../src/events/stop.js";
import { commentAggregateStopReason } from "../src/features/comment-checker.js";
import { loadDiag, markDirty, saveDiag } from "../src/features/diagnostics.js";
import {
  incompleteTodos,
  isStopPaused,
  mirrorTodos,
  setBoulder,
  setStopPaused,
} from "../src/features/todo-boulder.js";
import { loadRalph, startRalph } from "../src/features/ralph.js";
import { saveLastPrompt } from "../src/features/last-prompt.js";
import { readJson } from "../src/state/fs.js";
import { pathsFor } from "../src/state/paths.js";
import type { CategoryDisciplineState } from "../src/features/category-discipline.js";
import type { EnvConfig, HookInput } from "../src/protocol/types.js";

const tmpRoots: string[] = [];

function tmpWorkspace(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "omg-stop-orch-"));
  tmpRoots.push(d);
  return d;
}

function tmpDataRoot(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "omg-stop-orch-data-"));
  tmpRoots.push(d);
  return d;
}

afterEach(() => {
  for (const d of tmpRoots.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

/** 单 it 完整隔离上下文:唯一 workspace + pluginData + sessionId。 */
interface Ctx {
  ws: string;
  data: string;
  cfg: EnvConfig;
  sessionId: string;
}

function makeCtx(idx: number, over: Partial<EnvConfig> = {}): Ctx {
  const ws = tmpWorkspace();
  const data = tmpDataRoot();
  const sessionId = `stop-orch-${idx}-${Math.random().toString(36).slice(2, 8)}`;
  const cfg: EnvConfig = {
    pluginRoot: process.cwd(),
    pluginData: data,
    grokHome: data,
    stateDirName: ".omg",
    skillGate: false,
    intentGate: true,
    planMode: true,
    hashline: false,
    diagEnforce: true,
    hardOrchestration: true,
    maxRalphIter: 10,
    todoCooldownMs: 0,
    todoAbortWindowMs: 0,
    diagCommand: "",
    diagTimeoutMs: 5000,
    hashlineTtlMs: 30 * 60 * 1000,
    commentChecker: true,
    commentCheckerDeny: false,
    agentGuard: false,
    categoryDiscipline: true,
    todoMaxContinues: 20,
    todoMaxStagnation: 3,
    ...over,
  };
  return { ws, data, cfg, sessionId };
}

function stopInput(ctx: Ctx, over: Partial<HookInput> = {}): HookInput {
  return {
    raw: {},
    event: "stop",
    sessionId: ctx.sessionId,
    cwd: ctx.ws,
    workspaceRoot: ctx.ws,
    ...over,
  };
}

describe("stop orchestration priority", () => {
  it("段0 isStopPaused 最高优先级,其余门禁全置满仍直接放行", () => {
    const ctx = makeCtx(0);
    const input = stopInput(ctx, { lastAssistantMessage: "working on it" });

    // 其余门禁全置满:ralph 活跃 + boulder + todos + catDisc + diag dirty
    startRalph(input, ctx.cfg, "ultrawork ship everything", "ulw");
    setBoulder(input, ctx.cfg, {
      schemaVersion: 1,
      active: true,
      title: "巨型计划",
      planPath: "plan.md",
      updatedAt: "",
    });
    fs.writeFileSync(path.join(ctx.ws, "plan.md"), "- [ ] 待办项\n", "utf8");
    mirrorTodos(input, ctx.cfg, [{ content: "未完成事项", status: "pending" }]);
    saveLastPrompt(input, ctx.cfg, "deep dive 重构整个后端架构");
    markDirty(input, ctx.cfg, "src/a.ts");

    // 关键:打开 stop 暂停
    setStopPaused(input, ctx.cfg, true);
    expect(isStopPaused(input, ctx.cfg)).toBe(true);

    // 直接放行,不进任何下游门禁
    expect(handleStop(input, ctx.cfg)).toEqual({});
  });

  it("段1 ralph 活跃优先于段4 diagnostics,reason 含 ULW/ULTRAWORK LOOP 不含 VERIFY/DIAGNOSTICS BLOCK", () => {
    const ctx = makeCtx(1);
    const input = stopInput(ctx, { lastAssistantMessage: "继续推进中" });

    startRalph(input, ctx.cfg, "ship the full feature end to end", "ulw");
    markDirty(input, ctx.cfg, "src/x.ts");

    const out = handleStop(input, ctx.cfg);
    expect(out).toMatchObject({ decision: "block" });
    const reason = "reason" in out ? out.reason : "";
    expect(reason).toMatch(/ULTRAWORK|ULW LOOP|RALPH/);
    expect(reason).not.toMatch(/VERIFY BEFORE STOP/);
    expect(reason).not.toMatch(/DIAGNOSTICS BLOCK/);
  });

  it("段1 ralph 吞没段3 todos 与段4 diagnostics,reason 不含 TODO CONTINUATION/DIAGNOSTICS BLOCK", () => {
    const ctx = makeCtx(2);
    const input = stopInput(ctx, { lastAssistantMessage: "仍在工作" });

    startRalph(input, ctx.cfg, "ultrawork finish the migration", "ulw");
    mirrorTodos(input, ctx.cfg, [{ content: "还要写测试", status: "pending" }]);
    markDirty(input, ctx.cfg, "src/y.ts");

    const out = handleStop(input, ctx.cfg);
    expect(out).toMatchObject({ decision: "block" });
    const reason = "reason" in out ? out.reason : "";
    expect(reason).toMatch(/ULTRAWORK|ULW LOOP/);
    expect(reason).not.toMatch(/TODO CONTINUATION/);
    expect(reason).not.toMatch(/DIAGNOSTICS BLOCK/);
    expect(reason).not.toMatch(/VERIFY BEFORE STOP/);
  });

  it("段2 boulder + 开放 plan checkboxes 优先于段2.5 category-discipline", () => {
    const ctx = makeCtx(3);
    const input = stopInput(ctx, { lastAssistantMessage: "在执行计划" });

    // catDisc 触发条件齐备:deep 类 + 0 spawn
    saveLastPrompt(input, ctx.cfg, "deep dive 重建整个数据层");
    setBoulder(input, ctx.cfg, {
      schemaVersion: 1,
      active: true,
      title: "大石计划",
      planPath: "plan.md",
      updatedAt: "",
    });
    fs.writeFileSync(path.join(ctx.ws, "plan.md"), "# Plan\n- [ ] 第一步\n- [ ] 第二步\n", "utf8");

    const out = handleStop(input, ctx.cfg);
    expect(out).toMatchObject({ decision: "block" });
    const reason = "reason" in out ? out.reason : "";
    expect(reason).toMatch(/BOULDER/);
    expect(reason).toMatch(/PLAN CHECKBOXES/);
    expect(reason).not.toMatch(/CATEGORY_DISCIPLINE/);
  });

  it("段2 boulder checkboxes 全完成但非 DONE 仍 block;DONE 后清除", () => {
    const ctx = makeCtx(4);
    fs.writeFileSync(path.join(ctx.ws, "plan.md"), "# Plan\n- [x] 第一步\n- [x] 第二步\n", "utf8");
    setBoulder(stopInput(ctx), ctx.cfg, {
      schemaVersion: 1,
      active: true,
      title: "大石计划",
      updatedAt: "",
    });

    function run(msg: string) {
      return handleStop(stopInput(ctx, { lastAssistantMessage: msg }), ctx.cfg);
    }

    // 非 DONE → 仍 block,提示 DONE/VERIFIED
    const blocked = run("所有项已完成,准备收尾");
    expect(blocked).toMatchObject({ decision: "block" });
    const blockedReason = "reason" in blocked ? blocked.reason : "";
    expect(blockedReason).toMatch(/BOULDER/);
    expect(blockedReason).toMatch(/DONE|VERIFIED/);

    // DONE → boulder 清除,不再 BOULDER block
    const after = run("<promise>DONE</promise>");
    const afterReason = "decision" in after && after.decision === "block" ? after.reason : "";
    expect(afterReason).not.toMatch(/BOULDER/);
  });

  it("段2.5 category-discipline 优先于段3 todos 且每会话至多一次", () => {
    const ctx = makeCtx(5);
    const input = stopInput(ctx, { lastAssistantMessage: "工作中" });

    // boulder 关闭;catDisc 触发条件齐备(deep 类 + 0 spawn);todos 也有未完成项
    saveLastPrompt(input, ctx.cfg, "deep dive 重构核心模块");
    mirrorTodos(input, ctx.cfg, [{ content: "待办残留", status: "pending" }]);

    // 第一次:block 含 CATEGORY_DISCIPLINE,不含 TODO CONTINUATION
    const first = handleStop(input, ctx.cfg);
    expect(first).toMatchObject({ decision: "block" });
    const firstReason = "reason" in first ? first.reason : "";
    expect(firstReason).toMatch(/CATEGORY_DISCIPLINE/);
    expect(firstReason).not.toMatch(/TODO CONTINUATION/);

    // 副作用已落盘:category-discipline.json prompted=true
    const cdPath = pathsFor(ctx.ws, ctx.sessionId, ctx.cfg).categoryDiscipline;
    expect(fs.existsSync(cdPath)).toBe(true);
    const cdState = readJson<CategoryDisciplineState>(cdPath, {
      schemaVersion: 1,
      spawnCount: 0,
      prompted: false,
    });
    expect(cdState.prompted).toBe(true);

    // 第二次:catDisc 已 prompted → 放行给段3 todos
    const second = handleStop(input, ctx.cfg);
    expect(second).toMatchObject({ decision: "block" });
    const secondReason = "reason" in second ? second.reason : "";
    expect(secondReason).toMatch(/TODO CONTINUATION/);
    expect(secondReason).not.toMatch(/CATEGORY_DISCIPLINE/);

    // todos 确实仍存在(段3 触发是基于真实未完成项)
    expect(incompleteTodos(input, ctx.cfg).length).toBeGreaterThan(0);
  });

  it("段4 diagnostics soft-verify 一次窗口:首次 block 含 VERIFY BEFORE STOP,二次放行", () => {
    const ctx = makeCtx(6);
    // 无 ralph / boulder / todos / catDisc;diagEnforce=true 且无 diagCommand
    const input = stopInput(ctx, { lastAssistantMessage: "我编辑完了" });

    markDirty(input, ctx.cfg, "src/d.ts");

    // 首次:block 含 VERIFY BEFORE STOP
    const first = handleStop(input, ctx.cfg);
    expect(first).toMatchObject({ decision: "block" });
    const firstReason = "reason" in first ? first.reason : "";
    expect(firstReason).toMatch(/VERIFY BEFORE STOP/);

    // 副作用:diag.json softPrompted 已 true
    const st1 = loadDiag(input, ctx.cfg);
    expect(st1.softPrompted).toBe(true);

    // 二次:softPrompted 已 true → 放行
    const second = handleStop(input, ctx.cfg);
    expect(second).toEqual({});
  });

  it("段4 diagnostics lastErrors 硬阻断优先于 soft once,不含 VERIFY BEFORE STOP", () => {
    const ctx = makeCtx(7);
    const input = stopInput(ctx, { lastAssistantMessage: "尝试修复中" });

    // 直接落盘 DiagState:lastErrors 非空 + needsVerify=true
    saveDiag(input, ctx.cfg, {
      schemaVersion: 1,
      needsVerify: true,
      lastErrors: "Error: 测试失败 42 failed",
      lastRunAt: Date.now(),
      lastFiles: ["src/e.ts"],
      verifiedAt: 0,
      softPrompted: false,
    });

    const out = handleStop(input, ctx.cfg);
    expect(out).toMatchObject({ decision: "block" });
    const reason = "reason" in out ? out.reason : "";
    expect(reason).toMatch(/DIAGNOSTICS BLOCK/);
    expect(reason).not.toMatch(/VERIFY BEFORE STOP/);
  });

  it("全门禁未触发 → 返回 {} 放行", () => {
    const ctx = makeCtx(8);
    // commentChecker=true 但未 recordCommentSlop(无 slop 累积);diagEnforce 关闭避免误触
    const c = { ...ctx.cfg, diagEnforce: false };
    const input = stopInput(ctx, { lastAssistantMessage: "完成了实现" });

    // 断言前置:无 ralph / boulder / todos / catDisc prompt / comment slop
    expect(loadRalph(input, c)).toBeNull();
    expect(commentAggregateStopReason(input, c)).toBeNull();

    expect(handleStop(input, c)).toEqual({});
  });
});
