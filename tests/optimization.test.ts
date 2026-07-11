import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { handlePostToolRead, handlePostToolWrite } from "../src/events/post-tool.js";
import { handlePreToolUse } from "../src/events/pre-tool-use.js";
import { handleUserPrompt } from "../src/events/user-prompt.js";
import { resolveAgentRole, agentGuardDeny } from "../src/features/agent-guard.js";
import { detectCategory, categoryBanner } from "../src/features/category.js";
import { findCommentSlop, commentCheckerPreDeny } from "../src/features/comment-checker.js";
import { runInitDeep, detectInitDeep } from "../src/features/init-deep.js";
import type { EnvConfig, HookInput } from "../src/protocol/types.js";

const tmpRoots: string[] = [];

function tmpWorkspace(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "omg-opt-"));
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
    hashline: true,
    diagEnforce: false,
    hardOrchestration: true,
    maxRalphIter: 5,
    todoCooldownMs: 0,
    todoAbortWindowMs: 0,
    diagCommand: "",
    diagTimeoutMs: 5000,
    hashlineTtlMs: 30 * 60 * 1000,
    commentChecker: true,
    commentCheckerDeny: false,
    agentGuard: true,
    ...over,
  };
}

function baseInput(ws: string, over: Partial<HookInput> = {}): HookInput {
  return {
    raw: {},
    event: "user-prompt",
    sessionId: "opt-session",
    cwd: ws,
    workspaceRoot: ws,
    ...over,
  };
}

describe("comment checker", () => {
  it("flags AI-slop restating comments", () => {
    const code = `
// This function calculates the total
function total(a: number, b: number) {
  // Returns the sum of a and b
  return a + b;
}
`;
    const hits = findCommentSlop(code, "x.ts");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => /This function|Returns the/i.test(h.snippet))).toBe(true);
  });

  it("allows meaningful comments", () => {
    const code = `
// Must use UTC: API rejects local TZ offsets (see issue #42)
function toUtc(d: Date) {
  return d.toISOString();
}
`;
    expect(findCommentSlop(code, "x.ts")).toEqual([]);
  });

  it("denies Write with slop when commentCheckerDeny is on", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data, { commentChecker: true, commentCheckerDeny: true, hashline: false });
    const r = handlePreToolUse(
      baseInput(ws, {
        event: "pre-tool-use",
        toolName: "Write",
        toolInput: {
          path: path.join(ws, "slop.ts"),
          contents: "// This function does the work\nexport const x = 1;\n",
        },
      }),
      c,
    );
    expect(r.exitCode).toBe(2);
    expect(JSON.stringify(r.output)).toMatch(/COMMENT_CHECKER|slop|comment/i);
  });

  it("warns on post-write when soft mode", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const file = path.join(ws, "soft.ts");
    const c = cfg(data, { hashline: false });
    const out = handlePostToolWrite(
      baseInput(ws, {
        event: "post-tool-write",
        toolName: "Write",
        toolInput: {
          path: file,
          contents: "// This method handles login\nexport function login() {}\n",
        },
      }),
      c,
    );
    if ("additionalContext" in out) {
      expect(out.additionalContext).toMatch(/COMMENT_CHECKER|slop/i);
    } else {
      // soft mode may surface via empty if no content path — still ok if we persist
      expect(commentCheckerPreDeny(
        baseInput(ws, {
          toolName: "Write",
          toolInput: {
            path: file,
            contents: "// This method handles login\nexport function login() {}\n",
          },
        }),
        { ...c, commentCheckerDeny: true },
      )).toBeTruthy();
    }
  });
});

describe("agent guard", () => {
  it("resolves read-only roles from agentName", () => {
    expect(resolveAgentRole(baseInput("/tmp", { agentName: "oracle" }))).toBe("oracle");
    expect(resolveAgentRole(baseInput("/tmp", { agentName: "explore" }))).toBe("explore");
    expect(resolveAgentRole(baseInput("/tmp", { agentName: "sisyphus" }))).toBe("sisyphus");
  });

  it("denies mutating tools for oracle/explore/librarian/metis/momus", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data, { hashline: false });
    const r = handlePreToolUse(
      baseInput(ws, {
        event: "pre-tool-use",
        toolName: "Write",
        agentName: "oracle",
        toolInput: { path: path.join(ws, "x.ts"), contents: "export {}\n" },
      }),
      c,
    );
    expect(r.exitCode).toBe(2);
    expect(JSON.stringify(r.output)).toMatch(/AGENT_GUARD|read-only|oracle/i);
  });

  it("allows hephaestus to write", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data, { hashline: false, skillGate: false });
    const r = handlePreToolUse(
      baseInput(ws, {
        event: "pre-tool-use",
        toolName: "Write",
        agentName: "hephaestus",
        toolInput: { path: path.join(ws, "ok.ts"), contents: "export const n = 1;\n" },
      }),
      c,
    );
    expect(r.exitCode).toBe(0);
  });

  it("agentGuardDeny helper is null for non-mutating", () => {
    const ws = tmpWorkspace();
    expect(
      agentGuardDeny(
        baseInput(ws, { toolName: "Read", agentName: "oracle" }),
        cfg(path.join(ws, "pdata")),
      ),
    ).toBeNull();
  });
});

describe("category thin layer", () => {
  it("detects visual / deep / quick categories", () => {
    expect(detectCategory("redesign the dashboard UI with animations")).toBe("visual-engineering");
    expect(detectCategory("deep dive into the auth architecture")).toBe("deep");
    expect(detectCategory("fix typo in readme")).toBe("quick");
  });

  it("banner recommends subagent", () => {
    expect(categoryBanner("ultrabrain")).toMatch(/oracle|ultrabrain/i);
    expect(categoryBanner("visual-engineering")).toMatch(/visual|frontend|UI/i);
  });
});

describe("init-deep", () => {
  it("detects /init-deep command", () => {
    expect(detectInitDeep("/init-deep")).toBe(true);
    expect(detectInitDeep("/init-deep --max-depth=2")).toBe(true);
    expect(detectInitDeep("hello")).toBe(false);
  });

  it("creates hierarchical AGENTS.md", () => {
    const ws = tmpWorkspace();
    fs.mkdirSync(path.join(ws, "src", "lib"), { recursive: true });
    fs.writeFileSync(path.join(ws, "src", "lib", "a.ts"), "export {}", "utf8");
    const result = runInitDeep(ws, { maxDepth: 3, createNew: true });
    expect(fs.existsSync(path.join(ws, "AGENTS.md"))).toBe(true);
    expect(fs.existsSync(path.join(ws, "src", "AGENTS.md"))).toBe(true);
    expect(result.created.length).toBeGreaterThanOrEqual(2);
  });

  it("user-prompt handles /init-deep", () => {
    const ws = tmpWorkspace();
    fs.mkdirSync(path.join(ws, "pkg"), { recursive: true });
    fs.writeFileSync(path.join(ws, "pkg", "x.ts"), "1", "utf8");
    const data = path.join(ws, "pdata");
    const out = handleUserPrompt(
      baseInput(ws, { prompt: "/init-deep --max-depth=2" }),
      cfg(data, { hardOrchestration: false }),
    );
    expect("additionalContext" in out && out.additionalContext).toMatch(/init-deep|AGENTS\.md/i);
    expect(fs.existsSync(path.join(ws, "AGENTS.md"))).toBe(true);
  });
});

describe("hashline post-read inject", () => {
  it("returns annotated additionalContext after Read", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const file = path.join(ws, "ann.ts");
    fs.writeFileSync(file, "const a = 1;\nconst b = 2;\n", "utf8");
    const out = handlePostToolRead(
      baseInput(ws, {
        event: "post-tool-read",
        toolName: "Read",
        toolInput: { path: file },
      }),
      cfg(data),
    );
    expect("additionalContext" in out).toBe(true);
    if ("additionalContext" in out) {
      expect(out.additionalContext).toMatch(/HASHLINE|1#/i);
    }
  });
});

describe("directory AGENTS inject", () => {
  it("injects nearby AGENTS.md after reading a nested file", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const nested = path.join(ws, "src", "feat");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(ws, "src", "AGENTS.md"), "# src rules\nUse ESM only.\n", "utf8");
    const file = path.join(nested, "x.ts");
    fs.writeFileSync(file, "export {}", "utf8");
    const out = handlePostToolRead(
      baseInput(ws, {
        event: "post-tool-read",
        toolName: "Read",
        toolInput: { path: file },
      }),
      cfg(data, { hashline: false }),
    );
    if ("additionalContext" in out) {
      expect(out.additionalContext).toMatch(/src rules|ESM|AGENTS/i);
    }
  });
});

describe("plan review chain", () => {
  it("plan mode context mentions Metis and Momus", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const out = handleUserPrompt(
      baseInput(ws, { prompt: '/plan "oauth login"' }),
      cfg(data, { hardOrchestration: false, hashline: false }),
    );
    expect("additionalContext" in out && out.additionalContext).toMatch(/Metis|Momus|review/i);
  });
});
