/**
 * tool-paths + MultiEdit gate coverage (v1.1.22)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hashlinePreToolDeny, recordRead } from "../src/features/hashline.js";
import {
  activateHostPlanMode,
  planModeDeny,
  startPlanMode,
} from "../src/features/prometheus.js";
import {
  contentSnippetsFromToolInput,
  pathsFromApplyPatchText,
  pathsFromToolInput,
} from "../src/features/tool-paths.js";
import { commentCheckerPreDeny } from "../src/features/comment-checker.js";
import type { EnvConfig, HookInput } from "../src/protocol/types.js";

const tmpRoots: string[] = [];

function tmpWorkspace(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "omg-paths-"));
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
    event: "pre-tool-use",
    sessionId: "paths-sess",
    cwd: ws,
    workspaceRoot: ws,
    ...over,
  };
}

describe("pathsFromToolInput", () => {
  it("collects single path fields", () => {
    expect(pathsFromToolInput({ path: "a.ts" })).toEqual(["a.ts"]);
    expect(pathsFromToolInput({ file_path: "b.ts", target_file: "b.ts" })).toEqual([
      "b.ts",
    ]);
  });

  it("collects MultiEdit edits[] / files[] paths", () => {
    expect(
      pathsFromToolInput({
        edits: [
          { path: "src/a.ts", old_string: "x", new_string: "y" },
          { file_path: "src/b.ts", old_string: "a", new_string: "b" },
        ],
      }),
    ).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("returns empty for missing input", () => {
    expect(pathsFromToolInput(undefined)).toEqual([]);
    expect(pathsFromToolInput({})).toEqual([]);
  });

  it("extracts paths from apply_patch body (v1.1.23)", () => {
    const patch = [
      "*** Begin Patch",
      "*** Update File: src/a.ts",
      "@@",
      "-old",
      "+new",
      "*** Add File: src/b.ts",
      "+export const b = 1",
      "*** End Patch",
    ].join("\n");
    expect(pathsFromApplyPatchText(patch)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(pathsFromToolInput({ patch })).toEqual(["src/a.ts", "src/b.ts"]);
    expect(pathsFromToolInput({ diff: patch })).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("contentSnippetsFromToolInput covers MultiEdit new_string", () => {
    const sn = contentSnippetsFromToolInput({
      edits: [
        { path: "a.ts", new_string: "// This function does x\nexport const a = 1\n" },
        { path: "b.ts", new_string: "export const b = 2\n" },
      ],
    });
    expect(sn).toHaveLength(2);
    expect(sn[0].filePath).toBe("a.ts");
    expect(sn[0].content).toMatch(/This function/);
  });
});

describe("hashline apply_patch paths (v1.1.23)", () => {
  it("denies apply_patch Update File when path was never Read", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const target = path.join(ws, "src", "hit.ts");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "export const n = 1;\n", "utf8");
    const patch = `*** Begin Patch\n*** Update File: ${target}\n@@\n-export const n = 1;\n+export const n = 2;\n*** End Patch\n`;
    const deny = hashlinePreToolDeny(
      base(ws, {
        toolName: "ApplyPatch",
        toolInput: { patch },
      }),
      c,
    );
    expect(deny).toMatch(/Hashline|Read cache/i);
  });
});

describe("comment-checker MultiEdit (v1.1.23)", () => {
  it("PreTool deny scans edits[] new_string for slop", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"), {
      commentChecker: true,
      commentCheckerDeny: true,
      hashline: false,
    });
    const deny = commentCheckerPreDeny(
      base(ws, {
        toolName: "MultiEdit",
        toolInput: {
          edits: [
            {
              path: "clean.ts",
              new_string: "export const ok = 1;\n",
            },
            {
              path: "slop.ts",
              new_string: "// This function calculates the total\nexport const t = 0;\n",
            },
          ],
        },
      }),
      c,
    );
    expect(deny).toMatch(/COMMENT|slop|This function/i);
  });
});

describe("hashline MultiEdit paths (v1.1.22)", () => {
  it("denies MultiEdit when any existing path has no Read cache", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const a = path.join(ws, "a.ts");
    const b = path.join(ws, "b.ts");
    fs.writeFileSync(a, "export const a = 1;\n", "utf8");
    fs.writeFileSync(b, "export const b = 1;\n", "utf8");
    const input = base(ws, {
      toolName: "MultiEdit",
      toolInput: {
        edits: [
          { path: a, old_string: "a = 1", new_string: "a = 2" },
          { path: b, old_string: "b = 1", new_string: "b = 2" },
        ],
      },
    });
    const deny = hashlinePreToolDeny(input, c);
    expect(deny).toMatch(/Hashline|Read cache/i);
    expect(deny).toMatch(/a\.ts|b\.ts/i);
  });

  it("allows MultiEdit after each path was Read", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const a = path.join(ws, "a.ts");
    const b = path.join(ws, "b.ts");
    fs.writeFileSync(a, "export const a = 1;\n", "utf8");
    fs.writeFileSync(b, "export const b = 1;\n", "utf8");
    const input = base(ws);
    recordRead(input, c, a);
    recordRead(input, c, b);
    const deny = hashlinePreToolDeny(
      {
        ...input,
        toolName: "MultiEdit",
        toolInput: {
          edits: [
            { path: a, old_string: "a = 1", new_string: "a = 2" },
            { path: b, old_string: "b = 1", new_string: "b = 2" },
          ],
        },
      },
      c,
    );
    expect(deny).toBeNull();
  });

  it("denies MultiEdit with empty edits (no paths)", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const deny = hashlinePreToolDeny(
      base(ws, { toolName: "MultiEdit", toolInput: { edits: [] } }),
      c,
    );
    expect(deny).toMatch(/no file path/i);
  });
});

describe("planModeDeny MultiEdit paths (v1.1.22)", () => {
  it("blocks MultiEdit that touches src/ while plan-mode active", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    startPlanMode(input, c, "oauth");
    const deny = planModeDeny(
      {
        ...input,
        toolName: "MultiEdit",
        toolInput: {
          edits: [
            {
              path: path.join(ws, ".omg", "plans", "ok.md"),
              old_string: "a",
              new_string: "b",
            },
            {
              path: path.join(ws, "src", "leak.ts"),
              old_string: "x",
              new_string: "y",
            },
          ],
        },
      },
      c,
    );
    expect(deny).toMatch(/plan-mode|plans/i);
    expect(deny).toMatch(/leak|Blocked/i);
  });

  it("allows MultiEdit only under .omg/plans/", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    const pm = startPlanMode(input, c, "ok");
    const p1 = path.join(path.dirname(pm.planFile!), "a.md");
    const p2 = path.join(path.dirname(pm.planFile!), "b.md");
    fs.writeFileSync(p1, "# a\n", "utf8");
    fs.writeFileSync(p2, "# b\n", "utf8");
    expect(
      planModeDeny(
        {
          ...input,
          toolName: "MultiEdit",
          toolInput: {
            edits: [
              { path: p1, old_string: "a", new_string: "A" },
              { path: p2, old_string: "b", new_string: "B" },
            ],
          },
        },
        c,
      ),
    ).toBeNull();
  });
});
