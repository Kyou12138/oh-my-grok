import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { handlePostToolRead } from "../src/events/post-tool.js";
import { handlePreToolUse } from "../src/events/pre-tool-use.js";
import { handleStop } from "../src/events/stop.js";
import { handleUserPrompt } from "../src/events/user-prompt.js";
import { markDirty } from "../src/features/diagnostics.js";
import { annotateLines, lineTag } from "../src/features/hashline.js";
import type { EnvConfig, HookInput } from "../src/protocol/types.js";

const tmpRoots: string[] = [];

function tmpWorkspace(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "omg-gap-"));
  tmpRoots.push(d);
  return d;
}

afterEach(() => {
  for (const d of tmpRoots.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

function cfg(pluginRoot: string, pluginData: string, over: Partial<EnvConfig> = {}): EnvConfig {
  return {
    pluginRoot,
    pluginData,
    grokHome: pluginData,
    stateDirName: ".omg",
    skillGate: false,
    intentGate: true,
    planMode: true,
    hashline: true,
    diagEnforce: true,
    hardOrchestration: true,
    maxRalphIter: 5,
    todoCooldownMs: 0,
    todoAbortWindowMs: 0,
    diagCommand: "",
    diagTimeoutMs: 5000,
    hashlineTtlMs: 30 * 60 * 1000,
    ...over,
  };
}

function baseInput(ws: string, over: Partial<HookInput> = {}): HookInput {
  return {
    raw: {},
    event: "user-prompt",
    sessionId: "gap-session",
    cwd: ws,
    workspaceRoot: ws,
    ...over,
  };
}

describe("hashline", () => {
  it("annotates lines with stable tags", () => {
    const { tags, annotated } = annotateLines("hello\nworld");
    expect(tags[1]).toBe(lineTag("hello"));
    expect(annotated).toContain("1#");
    expect(annotated).toContain("| hello");
  });

  it("denies StrReplace without prior Read", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const file = path.join(ws, "a.ts");
    fs.writeFileSync(file, "const x = 1;\n", "utf8");
    const c = cfg(process.cwd(), data);
    const r = handlePreToolUse(
      baseInput(ws, {
        event: "pre-tool-use",
        toolName: "StrReplace",
        toolInput: { path: file, old_string: "const x = 1;", new_string: "const x = 2;" },
      }),
      c,
    );
    expect(r.exitCode).toBe(2);
    expect(JSON.stringify(r.output)).toMatch(/Hashline|Read/i);
  });

  it("allows StrReplace after Read with matching old_string", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const file = path.join(ws, "b.ts");
    fs.writeFileSync(file, "const y = 1;\n", "utf8");
    const c = cfg(process.cwd(), data);
    handlePostToolRead(
      baseInput(ws, {
        event: "post-tool-read",
        toolName: "Read",
        toolInput: { path: file },
      }),
      c,
    );
    const r = handlePreToolUse(
      baseInput(ws, {
        event: "pre-tool-use",
        toolName: "StrReplace",
        toolInput: { path: file, old_string: "const y = 1;", new_string: "const y = 2;" },
      }),
      c,
    );
    expect(r.exitCode).toBe(0);
    expect(r.output).toMatchObject({ decision: "allow" });
  });
});

describe("hard orchestration + diag soft", () => {
  it("injects hard orchestration banner", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(path.resolve(process.cwd()), data);
    // plugin root for rules may be cwd of test package
    const out = handleUserPrompt(baseInput(ws, { prompt: "implement feature" }), {
      ...c,
      pluginRoot: path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), ".."),
    });
    if ("additionalContext" in out) {
      expect(out.additionalContext).toContain("HARD protocol");
      expect(out.additionalContext).toContain("COMMENT_CHECKER");
    }
  });

  it("blocks stop once for soft verify after dirty", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(process.cwd(), data);
    const input = baseInput(ws, { event: "stop" });
    markDirty(input, c, "x.ts");
    const first = handleStop(input, c);
    expect(first).toMatchObject({ decision: "block" });
    const second = handleStop(input, c);
    expect(second).toEqual({});
  });
});
