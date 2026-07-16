/**
 * todo-boulder.ts dedicated suite (MAGI v0.16) —
 * was only indirectly covered via functional/stop tests.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { handleStop } from "../src/events/stop.js";
import type { EnvConfig, HookInput } from "../src/protocol/types.js";
import { handlePostToolTodo } from "../src/events/post-tool.js";
import {
  applyTodoUpdates,
  clearBoulder,
  extractTodosFromToolInput,
  hasOpenPlanCheckboxes,
  incompleteTodos,
  isAbortLikeStopReason,
  isStopPaused,
  isTodoMergeMode,
  loadBoulder,
  loadTodosMirror,
  markTodoContinued,
  mirrorTodos,
  resetTodoEnforcer,
  setBoulder,
  setStopPaused,
  todoEnforcerAllows,
  todoStopReason,
} from "../src/features/todo-boulder.js";

const tmpRoots: string[] = [];

function tmpWorkspace(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "omg-todo-"));
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
    ...over,
  };
}

function base(ws: string, over: Partial<HookInput> = {}): HookInput {
  return {
    raw: {},
    event: "stop",
    sessionId: "todo-sess",
    cwd: ws,
    workspaceRoot: ws,
    ...over,
  };
}

describe("hasOpenPlanCheckboxes boulder planPath first", () => {
  it("detects open boxes on boulder.planPath", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    const planPath = path.join(ws, "custom", "exec-plan.md");
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(planPath, "## Steps\n- [ ] ship it\n", "utf8");
    setBoulder(input, c, {
      schemaVersion: 1,
      active: true,
      planPath,
      title: "custom",
      notes: "",
      updatedAt: new Date().toISOString(),
    });
    const reason = hasOpenPlanCheckboxes(input, c);
    expect(reason).toBeTruthy();
    expect(reason).toMatch(/checkbox|open|plan/i);
  });
});

describe("extractTodosFromToolInput", () => {
  it("reads todos / items / todo keys and string entries", () => {
    expect(extractTodosFromToolInput({ todos: ["a", "b"] })).toEqual([
      { id: "0", content: "a", status: "pending" },
      { id: "1", content: "b", status: "pending" },
    ]);
    expect(
      extractTodosFromToolInput({
        items: [{ id: "1", text: "x", status: "in_progress" }],
      }),
    ).toEqual([{ id: "1", content: "x", status: "in_progress" }]);
    expect(extractTodosFromToolInput({ todo: [{ title: "t" }] })[0].content).toBe(
      "t",
    );
    // status-only patch: empty content (merge keeps prior text)
    expect(
      extractTodosFromToolInput({
        todos: [{ id: "a", status: "completed" }],
      }),
    ).toEqual([{ id: "a", content: "", status: "completed" }]);
    expect(extractTodosFromToolInput(undefined)).toEqual([]);
    expect(extractTodosFromToolInput({ todos: "nope" as unknown as string[] })).toEqual(
      [],
    );
  });
});

describe("applyTodoUpdates merge (v1.1.9 Grok todo_write default)", () => {
  it("isTodoMergeMode defaults true; false only when explicit", () => {
    expect(isTodoMergeMode(undefined)).toBe(true);
    expect(isTodoMergeMode({})).toBe(true);
    expect(isTodoMergeMode({ merge: true })).toBe(true);
    expect(isTodoMergeMode({ merge: false })).toBe(false);
    expect(isTodoMergeMode({ merge: "false" })).toBe(false);
  });

  it("merge keeps prior content and other items on status-only patch", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    mirrorTodos(input, c, [
      { id: "1", content: "Explore codebase", status: "in_progress" },
      { id: "2", content: "Write tests", status: "pending" },
    ]);
    applyTodoUpdates(
      input,
      c,
      [{ id: "1", content: "", status: "completed" }],
      true,
    );
    const all = loadTodosMirror(input, c);
    expect(all).toHaveLength(2);
    expect(all.find((t) => t.id === "1")).toMatchObject({
      content: "Explore codebase",
      status: "completed",
    });
    expect(all.find((t) => t.id === "2")?.status).toBe("pending");
    expect(incompleteTodos(input, c).map((t) => t.id)).toEqual(["2"]);
  });

  it("merge=false replaces entire list", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    mirrorTodos(input, c, [
      { id: "old", content: "gone", status: "pending" },
    ]);
    applyTodoUpdates(
      input,
      c,
      [{ id: "new", content: "only", status: "pending" }],
      false,
    );
    expect(loadTodosMirror(input, c)).toEqual([
      { id: "new", content: "only", status: "pending" },
    ]);
  });

  it("PostTool todo merge does not reset enforcer when other todos open", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    mirrorTodos(input, c, [
      { id: "1", content: "A", status: "in_progress" },
      { id: "2", content: "B", status: "pending" },
    ]);
    markTodoContinued(input, c, 1_000_000);
    handlePostToolTodo(
      base(ws, {
        event: "post-tool-todo",
        toolName: "todo_write",
        toolInput: {
          merge: true,
          todos: [{ id: "1", status: "completed" }],
        },
      }),
      c,
    );
    // enforcer should still have lastContinueAt (not reset) because todo 2 open
    const gate = todoEnforcerAllows(input, c, 1_000_000 + 100);
    expect(gate.allow).toBe(false);
    expect(gate.reason).toBe("todo-enforcer-cooldown");
    expect(incompleteTodos(input, c)).toHaveLength(1);
  });
});

describe("incompleteTodos status filter", () => {
  it("treats completed/done/cancelled/canceled as finished", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    mirrorTodos(input, c, [
      { content: "a", status: "pending" },
      { content: "b", status: "completed" },
      { content: "c", status: "DONE" },
      { content: "d", status: "cancelled" },
      { content: "e", status: "canceled" },
      { content: "f", status: "in_progress" },
    ]);
    const open = incompleteTodos(input, c);
    expect(open.map((t) => t.content).sort()).toEqual(["a", "f"]);
  });
});

describe("isAbortLikeStopReason", () => {
  it("matches abort/error/timeout family", () => {
    expect(isAbortLikeStopReason("aborted")).toBe(true);
    expect(isAbortLikeStopReason("tool_error")).toBe(true);
    expect(isAbortLikeStopReason("timeout")).toBe(true);
    expect(isAbortLikeStopReason("rate_limit")).toBe(true);
    expect(isAbortLikeStopReason("failed")).toBe(true);
  });

  it("does not match normal end_turn or empty", () => {
    expect(isAbortLikeStopReason("end_turn")).toBe(false);
    expect(isAbortLikeStopReason("")).toBe(false);
    expect(isAbortLikeStopReason(undefined)).toBe(false);
    // must not treat success chatter as abort
    expect(isAbortLikeStopReason("stop")).toBe(false);
  });
});

describe("todoEnforcerAllows cooldown / abort-window / max", () => {
  it("allows first continue", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    expect(todoEnforcerAllows(base(ws, { stopReason: "end_turn" }), c, 1000).allow).toBe(
      true,
    );
  });

  it("cooldown blocks end_turn re-yank", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"), { todoCooldownMs: 10_000 });
    const input = base(ws);
    markTodoContinued(input, c, 1_000);
    const r = todoEnforcerAllows(
      base(ws, { stopReason: "end_turn" }),
      c,
      1_000 + 500,
    );
    expect(r.allow).toBe(false);
    expect(r.reason).toMatch(/cooldown/i);
  });

  it("abort-window re-allows within window after continue", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"), {
      todoCooldownMs: 60_000,
      todoAbortWindowMs: 5_000,
    });
    const input = base(ws);
    markTodoContinued(input, c, 10_000);
    const r = todoEnforcerAllows(
      base(ws, { stopReason: "tool_error" }),
      c,
      10_000 + 1_000,
    );
    expect(r.allow).toBe(true);
    expect(r.reason).toMatch(/abort/i);
  });

  it("abort-window does not apply after window expires", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"), {
      todoCooldownMs: 60_000,
      todoAbortWindowMs: 1_000,
    });
    const input = base(ws);
    markTodoContinued(input, c, 10_000);
    const r = todoEnforcerAllows(
      base(ws, { stopReason: "aborted" }),
      c,
      10_000 + 5_000,
    );
    expect(r.allow).toBe(false);
    expect(r.reason).toMatch(/cooldown/i);
  });

  it("max consecutive continues blocks further yank", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"), { todoCooldownMs: 0 });
    const input = base(ws);
    for (let i = 0; i < 20; i++) {
      markTodoContinued(input, c, 1000 + i);
    }
    const r = todoEnforcerAllows(base(ws, { stopReason: "end_turn" }), c, 2000);
    expect(r.allow).toBe(false);
    expect(r.reason).toMatch(/max/i);
  });

  it("resetTodoEnforcer clears max lock", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"), { todoCooldownMs: 0 });
    const input = base(ws);
    for (let i = 0; i < 20; i++) markTodoContinued(input, c, 1000 + i);
    resetTodoEnforcer(input, c);
    expect(todoEnforcerAllows(base(ws), c, 3000).allow).toBe(true);
  });
});

describe("boulder + stop pause", () => {
  it("set/load/clear boulder and stop pause", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    expect(loadBoulder(input, c)).toBeNull();
    setBoulder(input, c, {
      schemaVersion: 1,
      active: true,
      planPath: "p.md",
      title: "t",
      notes: "n",
      updatedAt: new Date().toISOString(),
    });
    expect(loadBoulder(input, c)?.title).toBe("t");
    clearBoulder(input, c);
    expect(loadBoulder(input, c)).toBeNull();

    expect(isStopPaused(input, c)).toBe(false);
    setStopPaused(input, c, true);
    expect(isStopPaused(input, c)).toBe(true);
    setStopPaused(input, c, false);
    expect(isStopPaused(input, c)).toBe(false);
  });
});

describe("hasOpenPlanCheckboxes variants", () => {
  it("detects root plan.md and .omg/plans open boxes with * or -", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    fs.writeFileSync(path.join(ws, "plan.md"), "# P\n\n* [ ] open item\n", "utf8");
    expect(hasOpenPlanCheckboxes(input, c)).toMatch(/open item|plan\.md/i);

    fs.writeFileSync(path.join(ws, "plan.md"), "# P\n\n- [x] all done\n", "utf8");
    // still may find plans dir — ensure none
    const plans = path.join(ws, ".omg", "plans");
    fs.mkdirSync(plans, { recursive: true });
    fs.writeFileSync(path.join(plans, "a.md"), "# ok\n- [x] done\n", "utf8");
    expect(hasOpenPlanCheckboxes(input, c)).toBeNull();

    fs.writeFileSync(path.join(plans, "b.md"), "steps:\n  - [ ] nested-looking\n", "utf8");
    // indented open box should still count (common markdown)
    expect(hasOpenPlanCheckboxes(input, c)).toMatch(/plans|open|checkbox/i);
  });
});

describe("todoStopReason + Stop path", () => {
  it("formats incomplete list and Stop blocks via handleStop", () => {
    const reason = todoStopReason([
      { content: "one", status: "pending" },
      { content: "two", status: "in_progress" },
    ]);
    expect(reason).toMatch(/one/);
    expect(reason).toMatch(/two/);

    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"), { todoCooldownMs: 0 });
    mirrorTodos(base(ws), c, [{ content: "ship it", status: "pending" }]);
    const stop = handleStop(
      base(ws, { lastAssistantMessage: "still working on ship it" }),
      c,
    );
    expect(stop).toMatchObject({ decision: "block" });
    expect(JSON.stringify(stop)).toMatch(/ship it|TODO/i);
  });
});
