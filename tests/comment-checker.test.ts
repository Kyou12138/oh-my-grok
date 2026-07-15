/**
 * comment-checker.ts dedicated suite (MAGI v0.22).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { handlePostToolWrite } from "../src/events/post-tool.js";
import { handlePreToolUse } from "../src/events/pre-tool-use.js";
import { handleStop } from "../src/events/stop.js";
import type { EnvConfig, HookInput } from "../src/protocol/types.js";
import {
  commentAggregateStopReason,
  commentCheckerPostWarn,
  commentCheckerPreDeny,
  findCommentSlop,
  formatCommentHits,
  loadCommentAggregate,
  markCommentSoftPrompted,
  recordCommentSlop,
} from "../src/features/comment-checker.js";

const tmpRoots: string[] = [];

function tmpWorkspace(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "omg-cc-"));
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
    commentChecker: true,
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
    sessionId: "cc-sess",
    cwd: ws,
    workspaceRoot: ws,
    ...over,
  };
}

describe("findCommentSlop", () => {
  it("flags English restating / implements / handles", () => {
    const hits = findCommentSlop(
      [
        "// This function calculates the total",
        "function sum() {}",
        "// Implements the login flow",
        "export function login() {}",
        "// Handles the request payload",
        "export function handle() {}",
      ].join("\n"),
      "x.ts",
    );
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits.some((h) => h.reason === "restates code")).toBe(true);
  });

  it("flags Chinese restating", () => {
    const hits = findCommentSlop(
      "// 这个函数用于计算总和\nexport const t = 1;\n",
      "c.ts",
    );
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].reason).toBe("restates code");
  });

  it("flags emoji decoration and narration", () => {
    const emoji = findCommentSlop("// 🚀 ship it\nconst x = 1;\n", "e.ts");
    expect(emoji.some((h) => h.reason === "emoji decoration")).toBe(true);
    const nar = findCommentSlop("// here we parse the body\nconst y = 1;\n", "n.ts");
    expect(nar.some((h) => h.reason === "narration comment")).toBe(true);
  });

  it("skips non-code extensions and empty", () => {
    expect(findCommentSlop("// This function is bad", "README.md")).toEqual([]);
    expect(findCommentSlop("", "a.ts")).toEqual([]);
  });

  it("allows intent-bearing comments", () => {
    const hits = findCommentSlop(
      [
        "// Must run before hydration — SSR cookie race (see #412).",
        "export function init() {}",
        "// Boundary: user may be null when token expired mid-request.",
        "export function auth() {}",
      ].join("\n"),
      "ok.ts",
    );
    expect(hits).toEqual([]);
  });
});

describe("aggregate + Stop", () => {
  it("commentAggregateStopReason null below threshold / after soft", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    expect(commentAggregateStopReason(input, c)).toBeNull();
    recordCommentSlop(input, c, "a.ts", 2);
    expect(commentAggregateStopReason(input, c)).toBeNull();
    recordCommentSlop(input, c, "b.ts", 1);
    const r = commentAggregateStopReason(input, c);
    expect(r).toMatch(/COMMENT_AGGREGATE/);
    markCommentSoftPrompted(input, c);
    expect(commentAggregateStopReason(input, c)).toBeNull();
  });

  it("disabled commentChecker → no aggregate", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"), { commentChecker: false });
    recordCommentSlop(base(ws), c, "a.ts", 5);
    expect(commentAggregateStopReason(base(ws), c)).toBeNull();
  });

  it("production: 3 slop writes → Stop COMMENT_AGGREGATE once", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
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
      base(ws, { lastAssistantMessage: "wrote helpers" }),
      c,
    );
    expect(stop).toMatchObject({ decision: "block" });
    expect(JSON.stringify(stop)).toMatch(/COMMENT_AGGREGATE|slop|AI/i);
    const stop2 = handleStop(
      base(ws, { lastAssistantMessage: "cleaned comments" }),
      c,
    );
    if ("decision" in stop2 && stop2.decision === "block") {
      expect(JSON.stringify(stop2)).not.toMatch(/COMMENT_AGGREGATE/);
    }
  });
});

describe("PreTool deny + PostTool warn", () => {
  it("preDeny only when commentCheckerDeny", () => {
    const ws = tmpWorkspace();
    const soft = cfg(path.join(ws, "pdata"), { commentCheckerDeny: false });
    const hard = cfg(path.join(ws, "pdata2"), {
      commentCheckerDeny: true,
      commentChecker: true,
    });
    const input = base(ws, {
      event: "pre-tool-use",
      toolName: "Write",
      toolInput: {
        path: path.join(ws, "c.ts"),
        contents: "// 这个方法处理登录逻辑\nexport function login() {}\n",
      },
    });
    expect(commentCheckerPreDeny(input, soft)).toBeNull();
    expect(commentCheckerPreDeny(input, hard)).toMatch(/OMG_COMMENT_CHECKER|这个/);
  });

  it("PreTool hard deny production path", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"), {
      commentChecker: true,
      commentCheckerDeny: true,
      hashline: false,
    });
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

  it("postWarn records aggregate and returns banner", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const warn = commentCheckerPostWarn(
      base(ws, {
        event: "post-tool-write",
        toolName: "Write",
        toolInput: {
          path: path.join(ws, "w.ts"),
          contents: "// This function returns the user\nexport const u = 1;\n",
        },
      }),
      c,
    );
    expect(warn).toMatch(/OMG_COMMENT_CHECKER/);
    expect(loadCommentAggregate(base(ws), c).hitCount).toBeGreaterThanOrEqual(1);
  });

  it("formatCommentHits structure", () => {
    const s = formatCommentHits(
      [{ line: 1, snippet: "// bad", reason: "restates code" }],
      "f.ts",
    );
    expect(s).toMatch(/OMG_COMMENT_CHECKER/);
    expect(s).toMatch(/L1/);
    expect(s).toMatch(/f\.ts/);
  });
});
