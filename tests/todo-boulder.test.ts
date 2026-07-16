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
  allTodosCompleteStopReason,
  hasOpenPlanCheckboxes,
  incompleteTodos,
  isAbortLikeStopReason,
  isStopPaused,
  isTodoMergeMode,
  isTodoOpenStatus,
  loadBoulder,
  loadTodoCompleteSignal,
  loadTodosMirror,
  markTodoContinued,
  mirrorTodos,
  parsePlanTaskCheckboxes,
  planTasksToTodos,
  resetTodoEnforcer,
  seedTodosFromPlanIfEmpty,
  setBoulder,
  setStopPaused,
  syncTodosFromPlanCheckboxes,
  todoEnforcerAllows,
  todoStopReason,
} from "../src/features/todo-boulder.js";
import { handlePostToolWrite } from "../src/events/post-tool.js";

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
    todoMaxContinues: 20,
    todoMaxStagnation: 3,
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

  it("stagnation circuit opens after N identical open-todo yanks (omo #6133)", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"), {
      todoCooldownMs: 0,
      todoMaxStagnation: 3,
      todoMaxContinues: 50,
    });
    const input = base(ws);
    const open = [{ id: "1", content: "stuck", status: "pending" }];
    mirrorTodos(input, c, open);
    // three continues with same fingerprint
    markTodoContinued(input, c, 1000, open);
    markTodoContinued(input, c, 2000, open);
    markTodoContinued(input, c, 3000, open);
    const gate = todoEnforcerAllows(input, c, 4000);
    expect(gate.allow).toBe(false);
    expect(gate.reason).toBe("todo-enforcer-stagnation");
    // progress resets stagnation
    const progressed = [{ id: "1", content: "stuck", status: "in_progress" }];
    mirrorTodos(input, c, progressed);
    markTodoContinued(input, c, 5000, progressed);
    expect(todoEnforcerAllows(input, c, 6000).allow).toBe(true);
  });

  it("todoMaxContinues is configurable (omo #6133)", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"), {
      todoCooldownMs: 0,
      todoMaxContinues: 2,
      todoMaxStagnation: 99,
    });
    const input = base(ws);
    const open = [{ content: "x", status: "pending" }];
    mirrorTodos(input, c, open);
    markTodoContinued(input, c, 1, open);
    markTodoContinued(input, c, 2, [{ content: "y", status: "pending" }]);
    expect(todoEnforcerAllows(input, c, 3).reason).toBe("todo-enforcer-max");
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

  it("treats blocked/deferred/waiting as closed (omo #1775 no-progress)", () => {
    expect(isTodoOpenStatus("blocked")).toBe(false);
    expect(isTodoOpenStatus("deferred")).toBe(false);
    expect(isTodoOpenStatus("waiting")).toBe(false);
    expect(isTodoOpenStatus("on_hold")).toBe(false);
    expect(isTodoOpenStatus("on-hold")).toBe(false);
    expect(isTodoOpenStatus("paused")).toBe(false);
    expect(isTodoOpenStatus("pending")).toBe(true);
    expect(isTodoOpenStatus("in_progress")).toBe(true);

    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    mirrorTodos(input, c, [
      { content: "need secrets", status: "blocked" },
      { content: "later", status: "deferred" },
      { content: "ship", status: "completed" },
    ]);
    expect(incompleteTodos(input, c)).toEqual([]);
  });
});

describe("allTodosCompleteStopReason (omo #4111)", () => {
  it("idle + all closed → one-shot ALL_TODOS_COMPLETE", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws, { lastAssistantMessage: "ok" });
    mirrorTodos(input, c, [
      { content: "a", status: "completed" },
      { content: "b", status: "blocked" },
    ]);
    const r1 = allTodosCompleteStopReason(input, c, {
      idle: true,
      message: "ok",
    });
    expect(r1).toMatch(/ALL_TODOS_COMPLETE/);
    expect(r1).toMatch(/summary/i);
    expect(loadTodoCompleteSignal(input, c).signaled).toBe(true);

    // second time: no re-yank
    expect(
      allTodosCompleteStopReason(input, c, { idle: true, message: "ok" }),
    ).toBeNull();
  });

  it("substantial non-idle wrap-up marks signaled without block", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    mirrorTodos(input, c, [{ content: "a", status: "completed" }]);
    const long =
      "Shipped the auth fix and verified with npm test; all checklist items closed.";
    expect(
      allTodosCompleteStopReason(input, c, { idle: false, message: long }),
    ).toBeNull();
    expect(loadTodoCompleteSignal(input, c).signaled).toBe(true);
  });

  it("empty mirror or open todos → null; open work clears prior signal", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    expect(allTodosCompleteStopReason(input, c, { idle: true })).toBeNull();

    mirrorTodos(input, c, [{ content: "a", status: "completed" }]);
    allTodosCompleteStopReason(input, c, { idle: true, message: "ok" });
    expect(loadTodoCompleteSignal(input, c).signaled).toBe(true);

    mirrorTodos(input, c, [
      { content: "a", status: "completed" },
      { content: "new", status: "pending" },
    ]);
    expect(
      allTodosCompleteStopReason(input, c, { idle: true, message: "ok" }),
    ).toBeNull();
    expect(loadTodoCompleteSignal(input, c).signaled).toBe(false);
  });

  it("Stop path: idle after all complete blocks once with ALL_TODOS_COMPLETE", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"), { todoCooldownMs: 0 });
    mirrorTodos(base(ws), c, [
      { content: "one", status: "completed" },
      { content: "two", status: "cancelled" },
    ]);
    const stop1 = handleStop(
      base(ws, { lastAssistantMessage: "done" }),
      c,
    );
    expect(stop1).toMatchObject({ decision: "block" });
    expect(JSON.stringify(stop1)).toMatch(/ALL_TODOS_COMPLETE/);

    const stop2 = handleStop(
      base(ws, { lastAssistantMessage: "done" }),
      c,
    );
    expect(stop2).toEqual({});
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

  it("ignores empty placeholder - [ ] (v1.1.18 stuck-boulder fix)", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    fs.writeFileSync(
      path.join(ws, "plan.md"),
      ["# P", "## Steps", "- [ ] ", "- [ ]", "- [x] done work", "## Review", "- [ ] Metis gap"].join(
        "\n",
      ),
      "utf8",
    );
    // empty placeholders + Review open Metis must NOT keep stop yanking
    expect(hasOpenPlanCheckboxes(input, c)).toBeNull();
  });

  it("still flags labeled open tasks outside Review", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    fs.writeFileSync(
      path.join(ws, "plan.md"),
      "## Steps\n- [ ] ship api\n## Review\n- [ ] Metis\n",
      "utf8",
    );
    expect(hasOpenPlanCheckboxes(input, c)).toMatch(/ship api/i);
    expect(hasOpenPlanCheckboxes(input, c)).not.toMatch(/Metis/i);
  });
});

describe("parsePlanTaskCheckboxes + seedTodosFromPlanIfEmpty (omo #6066)", () => {
  it("parse skips Review and empty labels", () => {
    const tasks = parsePlanTaskCheckboxes(
      [
        "## Steps",
        "- [ ] 1. Implement",
        "- [x] 2. Done",
        "- [ ] ",
        "## Review",
        "- [ ] Metis",
        "- [x] Momus",
      ].join("\n"),
    );
    expect(tasks).toEqual([
      { label: "1. Implement", checked: false },
      { label: "2. Done", checked: true },
    ]);
  });

  it("seeds todos only when mirror empty", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    const plan = path.join(ws, "p.md");
    fs.writeFileSync(plan, "## Steps\n- [ ] alpha\n- [x] beta\n", "utf8");
    const seeded = seedTodosFromPlanIfEmpty(input, c, plan);
    expect(seeded).toEqual(planTasksToTodos(parsePlanTaskCheckboxes(fs.readFileSync(plan, "utf8"))));
    expect(loadTodosMirror(input, c)).toHaveLength(2);
    expect(incompleteTodos(input, c).map((t) => t.content)).toEqual(["alpha"]);

    // second seed does not overwrite
    mirrorTodos(input, c, [{ id: "keep", content: "user todo", status: "pending" }]);
    const again = seedTodosFromPlanIfEmpty(input, c, plan);
    expect(again).toHaveLength(1);
    expect(again[0].content).toBe("user todo");
  });
});

describe("syncTodosFromPlanCheckboxes (v1.1.20)", () => {
  it("promotes plan-N todos when plan rows become checked", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    const plan = path.join(ws, ".omg", "plans", "exec.md");
    fs.mkdirSync(path.dirname(plan), { recursive: true });
    fs.writeFileSync(plan, "## Steps\n- [ ] alpha\n- [ ] beta\n", "utf8");
    seedTodosFromPlanIfEmpty(input, c, plan);
    expect(incompleteTodos(input, c)).toHaveLength(2);

    fs.writeFileSync(plan, "## Steps\n- [x] alpha\n- [ ] beta\n", "utf8");
    const n = syncTodosFromPlanCheckboxes(input, c, plan);
    expect(n).toBe(1);
    expect(incompleteTodos(input, c).map((t) => t.content)).toEqual(["beta"]);
    expect(loadTodosMirror(input, c).find((t) => t.content === "alpha")?.status).toBe(
      "completed",
    );
  });

  it("does not reopen completed todos when plan row still open", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    const plan = path.join(ws, "plan.md");
    fs.writeFileSync(plan, "## Steps\n- [ ] only\n", "utf8");
    mirrorTodos(input, c, [{ id: "plan-1", content: "only", status: "completed" }]);
    expect(syncTodosFromPlanCheckboxes(input, c, plan)).toBe(0);
    expect(loadTodosMirror(input, c)[0].status).toBe("completed");
  });

  it("PostTool write on plan file syncs mirror", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"), { hashline: false, commentChecker: false });
    const input = base(ws, { event: "post-tool-write", sessionId: "todo-sess" });
    const plan = path.join(ws, ".omg", "plans", "w.md");
    fs.mkdirSync(path.dirname(plan), { recursive: true });
    fs.writeFileSync(plan, "## Steps\n- [ ] ship\n", "utf8");
    seedTodosFromPlanIfEmpty(input, c, plan);
    fs.writeFileSync(plan, "## Steps\n- [x] ship\n", "utf8");
    handlePostToolWrite(
      {
        ...input,
        event: "post-tool-write",
        toolName: "Write",
        toolInput: { path: plan, contents: "## Steps\n- [x] ship\n" },
      },
      c,
    );
    expect(incompleteTodos(input, c)).toHaveLength(0);
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
