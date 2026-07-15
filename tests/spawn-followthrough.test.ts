/**
 * spawn-followthrough.ts (MAGI v0.21) — after spawn, idle/announce Stop yanks once.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { handlePostToolSpawn } from "../src/events/post-tool.js";
import { handleStop } from "../src/events/stop.js";
import type { EnvConfig, HookInput } from "../src/protocol/types.js";
import {
  isSpawnAnnounceMessage,
  markSpawnFollowThrough,
  spawnFollowThroughStopReason,
} from "../src/features/spawn-followthrough.js";

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

  it("blocks once on idle after mark", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    markSpawnFollowThrough(input, c, "explore");
    const r1 = spawnFollowThroughStopReason(
      base(ws, { lastAssistantMessage: "ok" }),
      c,
    );
    expect(r1).toMatch(/SPAWN_FOLLOWTHROUGH|explore|subagent/i);
    // second stop — pending cleared
    expect(
      spawnFollowThroughStopReason(
        base(ws, { lastAssistantMessage: "ok" }),
        c,
      ),
    ).toBeNull();
  });

  it("blocks on spawn-announce; clears pending", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    markSpawnFollowThrough(base(ws), c, "oracle");
    const r = spawnFollowThroughStopReason(
      base(ws, { lastAssistantMessage: "Spawned oracle for architecture." }),
      c,
    );
    expect(r).toMatch(/SPAWN_FOLLOWTHROUGH|oracle/i);
  });

  it("real progress after spawn clears pending without block", () => {
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

  it("second Stop after follow-through does not re-block for same wave", () => {
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
    const stop2 = handleStop(
      base(ws, {
        lastAssistantMessage: "ok still idle",
      }),
      c,
    );
    // may block for other gates; must not re-fire SPAWN_FOLLOWTHROUGH
    if ("decision" in stop2 && stop2.decision === "block") {
      expect(JSON.stringify(stop2)).not.toMatch(/SPAWN_FOLLOWTHROUGH/);
    }
  });
});
