/**
 * agent-guard.ts + session-role.ts dedicated suite (MAGI v0.19).
 * Production path 1st PreTool gate — previously only omo-gap-v07 / orchestration slices.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { handlePreToolUse } from "../src/events/pre-tool-use.js";
import { handlePostToolSpawn } from "../src/events/post-tool.js";
import { handleUserPrompt } from "../src/events/user-prompt.js";
import type { EnvConfig, HookInput } from "../src/protocol/types.js";
import {
  agentGuardBanner,
  agentGuardDeny,
  isReadOnlyAgent,
  READ_ONLY_AGENTS,
  resolveAgentRole,
} from "../src/features/agent-guard.js";
import {
  clearSessionAgentRole,
  detectAgentCommand,
  extractSpawnRole,
  getSessionAgentRole,
  isSpawnTool,
  loadSessionAgentRoleState,
  setSessionAgentRole,
} from "../src/features/session-role.js";

const tmpRoots: string[] = [];

function tmpWorkspace(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "omg-ag-"));
  tmpRoots.push(d);
  return d;
}

afterEach(() => {
  for (const d of tmpRoots.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
  delete process.env.GROK_AGENT_NAME;
  delete process.env.OMG_AGENT_ROLE;
  delete process.env.GROK_SUBAGENT_TYPE;
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
    todoCooldownMs: 5_000,
    todoAbortWindowMs: 3_000,
    diagCommand: "",
    diagTimeoutMs: 5000,
    hashlineTtlMs: 30 * 60 * 1000,
    commentChecker: false,
    commentCheckerDeny: false,
    agentGuard: true,
    categoryDiscipline: false,
    ...over,
  };
}

function base(ws: string, over: Partial<HookInput> = {}): HookInput {
  return {
    raw: {},
    event: "pre-tool-use",
    sessionId: "ag-sess",
    cwd: ws,
    workspaceRoot: ws,
    ...over,
  };
}

// ─── 1. isReadOnlyAgent / banner ─────────────────────────────────────

describe("READ_ONLY_AGENTS + banner", () => {
  it("core specialists are read-only", () => {
    for (const r of [
      "oracle",
      "explore",
      "librarian",
      "metis",
      "momus",
      "looker",
      "multimodal-looker",
    ]) {
      expect(isReadOnlyAgent(r), r).toBe(true);
    }
  });

  it("implementers are not read-only", () => {
    for (const r of ["hephaestus", "sisyphus", "atlas", "prometheus"]) {
      expect(isReadOnlyAgent(r), r).toBe(false);
    }
  });

  it("agentGuardBanner: read-only / no-redelegate / empty", () => {
    expect(agentGuardBanner("oracle")).toMatch(/read-only/);
    expect(agentGuardBanner("atlas")).toMatch(/no-redelegate|execute-no-redelegate/);
    expect(agentGuardBanner("momus")).toMatch(/read-only/); // momus is read-only first
    expect(agentGuardBanner("hephaestus")).toBe("");
    expect(agentGuardBanner("")).toBe("");
  });
});

// ─── 2. resolveAgentRole ─────────────────────────────────────────────

describe("resolveAgentRole", () => {
  it("reads input.agentName", () => {
    const ws = tmpWorkspace();
    expect(resolveAgentRole(base(ws, { agentName: "Oracle" }))).toBe("oracle");
  });

  it("normalizes oh-my-grok: and oh-my-grok- prefixes", () => {
    const ws = tmpWorkspace();
    expect(
      resolveAgentRole(base(ws, { agentName: "oh-my-grok:explore" })),
    ).toBe("explore");
    expect(
      resolveAgentRole(base(ws, { agentName: "oh-my-grok-librarian" })),
    ).toBe("librarian");
  });

  it("reads raw.subagent_type when agentName empty", () => {
    const ws = tmpWorkspace();
    expect(
      resolveAgentRole(
        base(ws, { raw: { subagent_type: "oh-my-grok:metis" } }),
      ),
    ).toBe("metis");
  });

  it("env GROK_AGENT_NAME when input empty", () => {
    const ws = tmpWorkspace();
    process.env.GROK_AGENT_NAME = "oracle";
    expect(resolveAgentRole(base(ws))).toBe("oracle");
  });

  it("sticky session role when host omits agentName", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    setSessionAgentRole(base(ws), c, "explore", "spawn:task");
    expect(resolveAgentRole(base(ws), c)).toBe("explore");
  });

  it("slash-agent sticky beats host agentName", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    setSessionAgentRole(base(ws), c, "hephaestus", "slash-agent");
    expect(
      resolveAgentRole(
        base(ws, { agentName: "oracle", raw: { agentName: "oracle" } }),
        c,
      ),
    ).toBe("hephaestus");
  });

  it("spawn sticky does NOT beat host agentName (only slash-agent does)", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    setSessionAgentRole(base(ws), c, "explore", "spawn:spawn_subagent");
    // host re-tags → fromInput wins; spawn sticky is fallback only when empty
    expect(
      resolveAgentRole(base(ws, { agentName: "sisyphus" }), c),
    ).toBe("sisyphus");
  });

  it("empty → empty string (fail-open for guard)", () => {
    const ws = tmpWorkspace();
    expect(resolveAgentRole(base(ws), cfg(path.join(ws, "pdata")))).toBe("");
  });
});

// ─── 3. agentGuardDeny ───────────────────────────────────────────────

describe("agentGuardDeny", () => {
  it("null when agentGuard disabled", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"), { agentGuard: false });
    expect(
      agentGuardDeny(
        base(ws, {
          agentName: "oracle",
          toolName: "Write",
          toolInput: { path: "a.ts" },
        }),
        c,
      ),
    ).toBeNull();
  });

  it("null for non-mutating tools even if read-only role", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    expect(
      agentGuardDeny(
        base(ws, { agentName: "oracle", toolName: "Read", toolInput: {} }),
        c,
      ),
    ).toBeNull();
  });

  it("denies all READ_ONLY agents on Write", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    for (const role of READ_ONLY_AGENTS) {
      const reason = agentGuardDeny(
        base(ws, {
          agentName: role,
          toolName: "Write",
          toolInput: { path: "x.ts", contents: "1" },
        }),
        c,
      );
      expect(reason, role).toMatch(/AGENT_GUARD|read-only/i);
      expect(reason, role).toMatch(new RegExp(role.replace(/[_-]/g, "[-_]"), "i"));
    }
  });

  it("allows hephaestus / sisyphus Write", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    for (const role of ["hephaestus", "sisyphus", "atlas"]) {
      expect(
        agentGuardDeny(
          base(ws, {
            agentName: role,
            toolName: "Write",
            toolInput: { path: "x.ts" },
          }),
          c,
        ),
        role,
      ).toBeNull();
    }
  });

  it("denies StrReplace / Edit / Delete for explore", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    for (const toolName of ["StrReplace", "Edit", "Delete", "Multiedit"]) {
      expect(
        agentGuardDeny(
          base(ws, {
            agentName: "explore",
            toolName,
            toolInput: { path: "x.ts" },
          }),
          c,
        ),
        toolName,
      ).toMatch(/AGENT_GUARD/i);
    }
  });

  it("null when role empty (fail-open)", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    expect(
      agentGuardDeny(
        base(ws, { toolName: "Write", toolInput: { path: "x.ts" } }),
        c,
      ),
    ).toBeNull();
  });
});

// ─── 4. session-role helpers ─────────────────────────────────────────

describe("session-role helpers", () => {
  it("detectAgentCommand: /agent /agent-role /as", () => {
    expect(detectAgentCommand("/agent hephaestus")).toEqual({
      role: "hephaestus",
    });
    expect(detectAgentCommand("/agent-role oracle")).toEqual({ role: "oracle" });
    expect(detectAgentCommand("/as explore")).toEqual({ role: "explore" });
    expect(detectAgentCommand("please /agent hephaestus")).toBeNull();
    expect(detectAgentCommand("/agent")).toBeNull();
  });

  it("extractSpawnRole keys + prefix strip", () => {
    expect(extractSpawnRole({ subagent_type: "oh-my-grok:oracle" })).toBe(
      "oracle",
    );
    expect(extractSpawnRole({ subagentType: "explore" })).toBe("explore");
    expect(extractSpawnRole({ agent: "metis" })).toBe("metis");
    expect(extractSpawnRole({ type: "oh-my-grok-momus" })).toBe("momus");
    expect(extractSpawnRole({})).toBe("");
    expect(extractSpawnRole(undefined)).toBe("");
  });

  it("isSpawnTool names", () => {
    expect(isSpawnTool("spawn_subagent")).toBe(true);
    expect(isSpawnTool("SpawnSubagent")).toBe(true);
    expect(isSpawnTool("Task")).toBe(true);
    expect(isSpawnTool("call_omo_agent")).toBe(true);
    expect(isSpawnTool("Write")).toBe(false);
    expect(isSpawnTool(undefined)).toBe(false);
  });

  it("set / get / clear roundtrip with source", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    setSessionAgentRole(input, c, "Oracle", "slash-agent");
    expect(getSessionAgentRole(input, c)).toBe("oracle");
    expect(loadSessionAgentRoleState(input, c)?.source).toBe("slash-agent");
    clearSessionAgentRole(input, c);
    expect(getSessionAgentRole(input, c)).toBe("");
    expect(loadSessionAgentRoleState(input, c)).toBeNull();
  });

  it("setSessionAgentRole ignores empty role", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    setSessionAgentRole(base(ws), c, "   ");
    expect(getSessionAgentRole(base(ws), c)).toBe("");
  });
});

// ─── 5. production path PreTool / UserPrompt / PostTool ──────────────

describe("production path", () => {
  it("PreTool blocks oracle Write via agentName", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const r = handlePreToolUse(
      base(ws, {
        agentName: "oracle",
        toolName: "Write",
        toolInput: { path: path.join(ws, "x.ts"), contents: "export {}\n" },
      }),
      c,
    );
    expect(r.exitCode).toBe(2);
    expect(JSON.stringify(r.output)).toMatch(/AGENT_GUARD/i);
  });

  it("PostTool spawn does NOT sticky parent → Write without agentName allowed", () => {
    // Parent-session spawn must not AGENT_GUARD the orchestrator as the child role
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    handlePostToolSpawn(
      base(ws, {
        event: "post-tool-write",
        toolName: "spawn_subagent",
        toolInput: { subagent_type: "librarian", prompt: "docs" },
      }),
      c,
    );
    expect(getSessionAgentRole(base(ws), c)).toBe("");
    const r = handlePreToolUse(
      base(ws, {
        toolName: "Write",
        toolInput: { path: path.join(ws, "x.ts"), contents: "1\n" },
      }),
      c,
    );
    expect(r.exitCode).toBe(0);
  });

  it("/agent hephaestus then host-oracle Write allowed", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    handleUserPrompt(
      base(ws, {
        event: "user-prompt",
        prompt: "/agent hephaestus",
        agentName: "oracle",
      }),
      c,
    );
    expect(loadSessionAgentRoleState(base(ws), c)?.source).toBe("slash-agent");
    const r = handlePreToolUse(
      base(ws, {
        agentName: "oracle",
        toolName: "Write",
        toolInput: { path: path.join(ws, "ok.ts"), contents: "export const a=1\n" },
      }),
      c,
    );
    expect(r.exitCode).toBe(0);
  });

  it("non-slash UserPrompt with host agentName sets host-agentName source", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    handleUserPrompt(
      base(ws, {
        event: "user-prompt",
        prompt: "look into the bug",
        agentName: "explore",
      }),
      c,
    );
    const st = loadSessionAgentRoleState(base(ws), c);
    expect(st?.role).toBe("explore");
    expect(st?.source).toBe("host-agentName");
  });

  it("slash sticky survives later host-tagged UserPrompt", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    handleUserPrompt(
      base(ws, {
        event: "user-prompt",
        prompt: "/as hephaestus",
        agentName: "oracle",
      }),
      c,
    );
    handleUserPrompt(
      base(ws, {
        event: "user-prompt",
        prompt: "keep coding",
        agentName: "oracle",
      }),
      c,
    );
    expect(getSessionAgentRole(base(ws), c)).toBe("hephaestus");
    expect(loadSessionAgentRoleState(base(ws), c)?.source).toBe("slash-agent");
  });
});
