/**
 * spawn-followthrough.ts (MAGI v0.21) — after spawn, idle/announce Stop yanks once.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { handlePostToolSpawn } from "../src/events/post-tool.js";
import { handleStop } from "../src/events/stop.js";
import {
  handleSubagentEnd,
  handleSubagentStart,
} from "../src/events/subagent.js";
import type { EnvConfig, HookInput } from "../src/protocol/types.js";
import {
  clearSpawnFollowThrough,
  isInlineSubagentResult,
  isResultRecoveryTool,
  isSpawnAnnounceMessage,
  isSpawnFollowThroughPending,
  isSpawnResultRecoveredMessage,
  markSpawnFollowThrough,
  SPAWN_FOLLOWTHROUGH_MAX_YANKS,
  spawnFollowThroughPreDeny,
  spawnFollowThroughStopReason,
} from "../src/features/spawn-followthrough.js";
import { handlePreToolUse } from "../src/events/pre-tool-use.js";
import { getSessionAgentRole } from "../src/features/session-role.js";

const tmpRoots: string[] = [];

function tmpWorkspace(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "omg-sft-"));
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
    todoCooldownMs: 60_000,
    todoAbortWindowMs: 0,
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
    sessionId: "sft-sess",
    cwd: ws,
    workspaceRoot: ws,
    ...over,
  };
}

describe("isSpawnAnnounceMessage", () => {
  it("detects short spawn/dispatch announce", () => {
    expect(isSpawnAnnounceMessage("Spawned explore to map auth.")).toBe(true);
    expect(isSpawnAnnounceMessage("I dispatched hephaestus")).toBe(true);
    expect(isSpawnAnnounceMessage("已派出 oracle 做架构咨询")).toBe(true);
    expect(isSpawnAnnounceMessage("waiting for the subagent")).toBe(true);
  });

  it("rejects long or evidence-bearing messages", () => {
    expect(
      isSpawnAnnounceMessage(
        "Spawned explore; found 3 call sites in src/auth.ts and fixed the race.",
      ),
    ).toBe(false);
    expect(
      isSpawnAnnounceMessage(
        "Implemented the follow-through gate and verified tests passed.",
      ),
    ).toBe(false);
    expect(isSpawnAnnounceMessage("")).toBe(false);
  });
});

describe("spawnFollowThroughStopReason", () => {
  it("null when no pending spawn", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    expect(
      spawnFollowThroughStopReason(
        base(ws, { lastAssistantMessage: "ok" }),
        c,
      ),
    ).toBeNull();
  });

  it("blocks up to MAX_YANKS on idle after mark (v1.0 deepen)", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    markSpawnFollowThrough(input, c, "explore");
    const r1 = spawnFollowThroughStopReason(
      base(ws, { lastAssistantMessage: "ok" }),
      c,
    );
    expect(r1).toMatch(/SPAWN_FOLLOWTHROUGH|explore|subagent/i);
    expect(r1).toMatch(/1\/2|yank 1/i);
    const r2 = spawnFollowThroughStopReason(
      base(ws, { lastAssistantMessage: "ok" }),
      c,
    );
    expect(r2).toMatch(/SPAWN_FOLLOWTHROUGH|get_task_output|final/i);
    expect(r2).toMatch(/2\/2|yank 2/i);
    // third — wave exhausted
    expect(
      spawnFollowThroughStopReason(
        base(ws, { lastAssistantMessage: "ok" }),
        c,
      ),
    ).toBeNull();
    expect(SPAWN_FOLLOWTHROUGH_MAX_YANKS).toBe(2);
  });

  it("blocks on spawn-announce", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    markSpawnFollowThrough(base(ws), c, "oracle");
    const r = spawnFollowThroughStopReason(
      base(ws, { lastAssistantMessage: "Spawned oracle for architecture." }),
      c,
    );
    expect(r).toMatch(/SPAWN_FOLLOWTHROUGH|oracle/i);
  });

  it("result recovery language clears without block", () => {
    expect(
      isSpawnResultRecoveredMessage(
        "Used get_task_output; subagent returned path map.",
      ),
    ).toBe(true);
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    markSpawnFollowThrough(base(ws), c, "explore");
    const r = spawnFollowThroughStopReason(
      base(ws, {
        lastAssistantMessage:
          "Integrated explore findings into src/auth.ts and ran npm test.",
      }),
      c,
    );
    expect(r).toBeNull();
    expect(
      spawnFollowThroughStopReason(
        base(ws, { lastAssistantMessage: "ok" }),
        c,
      ),
    ).toBeNull();
  });
});

describe("production path PostTool + Stop", () => {
  it("spawn_subagent then idle Stop blocks with SPAWN_FOLLOWTHROUGH", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    handlePostToolSpawn(
      base(ws, {
        event: "post-tool-write",
        toolName: "spawn_subagent",
        toolInput: { subagent_type: "explore", prompt: "map routes" },
      }),
      c,
    );
    const stop = handleStop(
      base(ws, { lastAssistantMessage: "Spawned explore, waiting." }),
      c,
    );
    expect(stop).toMatchObject({ decision: "block" });
    expect(JSON.stringify(stop)).toMatch(/SPAWN_FOLLOWTHROUGH|explore/i);
  });

  it("third idle Stop after two yanks does not re-fire SPAWN_FOLLOWTHROUGH", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    handlePostToolSpawn(
      base(ws, {
        event: "post-tool-write",
        toolName: "spawn_subagent",
        toolInput: { subagent_type: "hephaestus", prompt: "impl" },
      }),
      c,
    );
    handleStop(base(ws, { lastAssistantMessage: "ok" }), c);
    handleStop(base(ws, { lastAssistantMessage: "ok" }), c);
    const stop3 = handleStop(base(ws, { lastAssistantMessage: "ok" }), c);
    if ("decision" in stop3 && stop3.decision === "block") {
      expect(JSON.stringify(stop3)).not.toMatch(/SPAWN_FOLLOWTHROUGH/);
    }
  });

  it("isResultRecoveryTool covers Grok native aliases (v1.1.8)", () => {
    expect(isResultRecoveryTool("get_task_output")).toBe(true);
    expect(isResultRecoveryTool("GetTaskOutput")).toBe(true);
    expect(isResultRecoveryTool("task_output")).toBe(true);
    expect(isResultRecoveryTool("get_command_or_subagent_output")).toBe(true);
    expect(isResultRecoveryTool("wait_tasks")).toBe(true);
    expect(isResultRecoveryTool("get_terminal_command_output")).toBe(true);
    expect(isResultRecoveryTool("Write")).toBe(false);
    expect(isResultRecoveryTool("task")).toBe(false);
  });

  it("get_task_output clears pending (v1.0.2 tool-path recovery)", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    expect(isResultRecoveryTool("get_task_output")).toBe(true);
    expect(isResultRecoveryTool("get_command_or_subagent_output")).toBe(true);
    markSpawnFollowThrough(base(ws), c, "explore");
    expect(isSpawnFollowThroughPending(base(ws), c)).toBe(true);
    const out = handlePostToolSpawn(
      base(ws, {
        event: "post-tool-write",
        toolName: "get_task_output",
        toolInput: { task_ids: ["abc"] },
        toolOutput: "explore found src/auth.ts callers",
      }),
      c,
    );
    expect(JSON.stringify(out)).toMatch(/recovered|cleared/i);
    expect(isSpawnFollowThroughPending(base(ws), c)).toBe(false);
    expect(
      spawnFollowThroughStopReason(
        base(ws, { lastAssistantMessage: "ok" }),
        c,
      ),
    ).toBeNull();
  });

  it("inline substantial spawn toolOutput does not arm follow-through", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const big =
      "Found 3 call sites in src/auth.ts and src/login.ts.\n" +
      "```ts\nexport function login() {}\n```\n" +
      "Recommend fixing the race in middleware next.";
    expect(isInlineSubagentResult(big)).toBe(true);
    handlePostToolSpawn(
      base(ws, {
        event: "post-tool-write",
        toolName: "spawn_subagent",
        toolInput: { subagent_type: "explore", prompt: "map" },
        toolOutput: big,
      }),
      c,
    );
    expect(isSpawnFollowThroughPending(base(ws), c)).toBe(false);
  });

  it("clearSpawnFollowThrough is idempotent", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    clearSpawnFollowThrough(base(ws), c);
    markSpawnFollowThrough(base(ws), c, "x");
    clearSpawnFollowThrough(base(ws), c);
    clearSpawnFollowThrough(base(ws), c);
    expect(isSpawnFollowThroughPending(base(ws), c)).toBe(false);
  });
});

describe("host SubagentStart / SubagentEnd (v1.1 Grok Build lifecycle)", () => {
  it("SubagentStart arms follow-through from subagentType", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const out = handleSubagentStart(
      base(ws, {
        event: "subagent-start",
        subagentType: "explore",
        raw: { subagentType: "explore" },
      }),
      c,
    );
    expect(out).toEqual({});
    expect(isSpawnFollowThroughPending(base(ws), c)).toBe(true);
    const stop = spawnFollowThroughStopReason(
      base(ws, { lastAssistantMessage: "ok" }),
      c,
    );
    expect(stop).toMatch(/SPAWN_FOLLOWTHROUGH|explore/i);
  });

  it("SubagentStart does not sticky parent to child role (v1.1.1)", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    handleSubagentStart(
      base(ws, {
        event: "subagent-start",
        subagentType: "explore",
        raw: { subagentType: "explore" },
      }),
      c,
    );
    // sticky empty → parent Write without agentName remains fail-open for agent-guard
    expect(getSessionAgentRole(base(ws), c)).toBe("");
  });

  it("SubagentEnd keeps pending — child done ≠ parent integrated (v1.1.3)", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    handleSubagentStart(
      base(ws, {
        event: "subagent-start",
        subagentType: "oracle",
        raw: { subagentType: "oracle" },
      }),
      c,
    );
    expect(isSpawnFollowThroughPending(base(ws), c)).toBe(true);
    const end = handleSubagentEnd(
      base(ws, { event: "subagent-end", subagentType: "oracle" }),
      c,
    );
    expect(end).toEqual({});
    // still pending so idle Stop still yanks
    expect(isSpawnFollowThroughPending(base(ws), c)).toBe(true);
    const yank = spawnFollowThroughStopReason(
      base(ws, { lastAssistantMessage: "ok" }),
      c,
    );
    expect(yank).toMatch(/SPAWN_FOLLOWTHROUGH|finished|oracle/i);
  });

  it("SubagentEnd alone still arms when Start was missed", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    handleSubagentEnd(
      base(ws, { event: "subagent-end", subagentType: "explore" }),
      c,
    );
    expect(isSpawnFollowThroughPending(base(ws), c)).toBe(true);
  });

  it("get_task_output still clears after SubagentEnd", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    handleSubagentStart(
      base(ws, {
        event: "subagent-start",
        subagentType: "explore",
        raw: { subagentType: "explore" },
      }),
      c,
    );
    handleSubagentEnd(
      base(ws, { event: "subagent-end", subagentType: "explore" }),
      c,
    );
    handlePostToolSpawn(
      base(ws, {
        event: "post-tool-write",
        toolName: "get_task_output",
        toolInput: { task_ids: ["x"] },
        toolOutput: "findings…",
      }),
      c,
    );
    expect(isSpawnFollowThroughPending(base(ws), c)).toBe(false);
  });
});

describe("spawnFollowThroughPreDeny (v1.1.4 host-enforced)", () => {
  it("allows mutate while child still running (pending, not finished)", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    markSpawnFollowThrough(base(ws), c, "explore");
    expect(spawnFollowThroughPreDeny(base(ws), c)).toBeNull();
  });

  it("denies first mutate after childFinished, then allows retry", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    handleSubagentStart(
      base(ws, {
        event: "subagent-start",
        subagentType: "explore",
        raw: { subagentType: "explore" },
      }),
      c,
    );
    handleSubagentEnd(
      base(ws, { event: "subagent-end", subagentType: "explore" }),
      c,
    );
    const first = spawnFollowThroughPreDeny(base(ws), c);
    expect(first).toMatch(/SPAWN_FOLLOWTHROUGH|get_task_output|finished/i);
    expect(spawnFollowThroughPreDeny(base(ws), c)).toBeNull();
  });

  it("production PreTool: End then Write deny once then allow", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"), {
      skillGate: false,
      hashline: false,
      planMode: false,
      agentGuard: false,
      categoryDiscipline: false,
    todoMaxContinues: 20,
    todoMaxStagnation: 3,
    });
    handleSubagentStart(
      base(ws, {
        event: "subagent-start",
        subagentType: "oracle",
        raw: { subagentType: "oracle" },
      }),
      c,
    );
    handleSubagentEnd(
      base(ws, { event: "subagent-end", subagentType: "oracle" }),
      c,
    );
    const write = {
      raw: {},
      event: "pre-tool-use" as const,
      sessionId: "sft-sess",
      cwd: ws,
      workspaceRoot: ws,
      toolName: "Write",
      toolInput: { path: path.join(ws, "x.ts"), contents: "export {}\n" },
    };
    const r1 = handlePreToolUse(write, c);
    expect(r1.exitCode).toBe(2);
    expect(JSON.stringify(r1.output)).toMatch(/SPAWN_FOLLOWTHROUGH/i);
    const r2 = handlePreToolUse(write, c);
    expect(r2.exitCode).toBe(0);
  });
});