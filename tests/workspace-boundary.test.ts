/**
 * Workspace write boundary (v1.1.32) — PreTool hard gate.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { handlePreToolUse } from "../src/events/pre-tool-use.js";
import { recordRead } from "../src/features/hashline.js";
import {
  isWorkspaceWritePath,
  workspaceBoundaryDeny,
} from "../src/features/workspace-boundary.js";
import type { EnvConfig, HookInput } from "../src/protocol/types.js";

const tmpRoots: string[] = [];

function tmpWorkspace(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "omg-ws-bound-"));
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
    hardOrchestration: false,
    maxRalphIter: 10,
    todoCooldownMs: 0,
    todoAbortWindowMs: 0,
    todoMaxContinues: 20,
    todoMaxStagnation: 3,
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
    event: "pre-tool-use",
    sessionId: "ws-bound",
    cwd: ws,
    workspaceRoot: ws,
    ...over,
  };
}

describe("isWorkspaceWritePath", () => {
  it("accepts relative and abs paths inside workspace", () => {
    const ws = tmpWorkspace();
    const input = base(ws);
    expect(isWorkspaceWritePath(input, "src/a.ts")).toBe(true);
    expect(isWorkspaceWritePath(input, path.join(ws, "src", "a.ts"))).toBe(true);
    expect(isWorkspaceWritePath(input, ".")).toBe(true);
  });

  it("rejects parent escape and foreign absolute paths", () => {
    const ws = tmpWorkspace();
    const input = base(ws);
    expect(isWorkspaceWritePath(input, "../escape.txt")).toBe(false);
    expect(isWorkspaceWritePath(input, path.join(ws, "..", "escape.txt"))).toBe(
      false,
    );
    const foreign = path.join(os.tmpdir(), "omg-foreign-out", "x.ts");
    expect(isWorkspaceWritePath(input, foreign)).toBe(false);
  });

  it("rejects empty path", () => {
    const ws = tmpWorkspace();
    expect(isWorkspaceWritePath(base(ws), "")).toBe(false);
  });
});

describe("workspaceBoundaryDeny", () => {
  it("denies Write with ../ escape", () => {
    const ws = tmpWorkspace();
    const deny = workspaceBoundaryDeny(
      base(ws, {
        toolName: "Write",
        toolInput: { path: "../escape.txt", contents: "pwned\n" },
      }),
    );
    expect(deny).toMatch(/WORKSPACE_BOUNDARY|escapes workspace/i);
  });

  it("allows path under workspace (returns null — later gates may still deny)", () => {
    const ws = tmpWorkspace();
    const deny = workspaceBoundaryDeny(
      base(ws, {
        toolName: "Write",
        toolInput: { path: "src/ok.ts", contents: "export {}\n" },
      }),
    );
    expect(deny).toBeNull();
  });

  it("denies MultiEdit when any entry escapes", () => {
    const ws = tmpWorkspace();
    const deny = workspaceBoundaryDeny(
      base(ws, {
        toolName: "MultiEdit",
        toolInput: {
          edits: [
            { path: "src/a.ts", old_string: "a", new_string: "b" },
            { path: "../leak.ts", old_string: "a", new_string: "b" },
          ],
        },
      }),
    );
    expect(deny).toMatch(/WORKSPACE_BOUNDARY|leak/i);
  });

  it("pathless returns null (hashline owns empty path)", () => {
    const ws = tmpWorkspace();
    expect(
      workspaceBoundaryDeny(
        base(ws, { toolName: "Write", toolInput: { contents: "x" } }),
      ),
    ).toBeNull();
  });
});

describe("handlePreToolUse workspace boundary (host-enforced)", () => {
  it("denies escape even when hashline is off", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"), { hashline: false, skillGate: false });
    const r = handlePreToolUse(
      base(ws, {
        toolName: "Write",
        toolInput: {
          path: path.join(ws, "..", "pwned-out.txt"),
          contents: "x\n",
        },
      }),
      c,
    );
    expect(r.exitCode).toBe(2);
    expect(JSON.stringify(r.output)).toMatch(/WORKSPACE_BOUNDARY/i);
  });

  it("allows in-workspace write after Read (hashline path)", () => {
    const ws = tmpWorkspace();
    const file = path.join(ws, "src", "app.ts");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "export const n = 1;\n", "utf8");
    const c = cfg(path.join(ws, "pdata"), { hashline: true, skillGate: false });
    const input = base(ws);
    recordRead(input, c, file);
    const r = handlePreToolUse(
      {
        ...input,
        toolName: "StrReplace",
        toolInput: {
          path: file,
          old_string: "export const n = 1;",
          new_string: "export const n = 2;",
        },
      },
      c,
    );
    expect(r.exitCode).toBe(0);
    expect(r.output).toMatchObject({ decision: "allow" });
  });

  it("denies apply_patch Update File outside workspace", () => {
    const ws = tmpWorkspace();
    const outside = path.join(path.dirname(ws), "outside-patch.ts");
    const patch = `*** Begin Patch\n*** Update File: ${outside}\n@@\n-a\n+b\n*** End Patch\n`;
    const c = cfg(path.join(ws, "pdata"), { hashline: false, skillGate: false });
    const r = handlePreToolUse(
      base(ws, { toolName: "ApplyPatch", toolInput: { patch } }),
      c,
    );
    expect(r.exitCode).toBe(2);
    expect(JSON.stringify(r.output)).toMatch(/WORKSPACE_BOUNDARY/i);
  });
});
