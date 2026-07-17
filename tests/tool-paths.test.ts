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

  it("parses apply_patch with space before colon + unified diff --git (v1.1.31)", () => {
    const spaced = "*** Update File : src/spaced.ts\n@@\n-a\n+b\n";
    expect(pathsFromApplyPatchText(spaced)).toEqual(["src/spaced.ts"]);
    const git = [
      "diff --git a/src/old.ts b/src/new.ts",
      "--- a/src/old.ts",
      "+++ b/src/new.ts",
      "@@ -1 +1 @@",
      "-a",
      "+b",
    ].join("\n");
    expect(pathsFromApplyPatchText(git)).toEqual(
      expect.arrayContaining(["src/old.ts", "src/new.ts"]),
    );
    expect(pathsFromToolInput({ patch: git })).toEqual(
      expect.arrayContaining(["src/old.ts", "src/new.ts"]),
    );
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

  it("path/content aliases filepath/target/text/body/replacement (v1.1.53)", () => {
    expect(pathsFromToolInput({ filepath: "a.ts" })).toEqual(["a.ts"]);
    expect(pathsFromToolInput({ target: "b.ts" })).toEqual(["b.ts"]);
    expect(pathsFromToolInput({ target_path: "c.ts" })).toEqual(["c.ts"]);
    const sn = contentSnippetsFromToolInput({
      path: "a.ts",
      text: "hello text",
    });
    expect(sn).toEqual([{ filePath: "a.ts", content: "hello text" }]);
    expect(
      contentSnippetsFromToolInput({ path: "a.ts", body: "hello body" })[0]
        ?.content,
    ).toBe("hello body");
    expect(
      contentSnippetsFromToolInput({ path: "a.ts", replacement: "rep" })[0]
        ?.content,
    ).toBe("rep");
    expect(
      contentSnippetsFromToolInput({ path: "a.ts", new_text: "nt" })[0]
        ?.content,
    ).toBe("nt");
  });

  it("path aliases TargetFile / FilePath / File PascalCase (v1.1.59)", () => {
    expect(pathsFromToolInput({ TargetFile: "a.ts" })).toEqual(["a.ts"]);
    expect(pathsFromToolInput({ FilePath: "b.ts" })).toEqual(["b.ts"]);
    expect(pathsFromToolInput({ File: "c.ts" })).toEqual(["c.ts"]);
  });

  it("path aliases fileUri / nested edit / cellPath (v1.1.60)", () => {
    expect(pathsFromToolInput({ fileUri: "file:///tmp/b.ts" })).toEqual([
      "/tmp/b.ts",
    ]);
    expect(pathsFromToolInput({ file_uri: "file:///tmp/c.ts" })).toEqual([
      "/tmp/c.ts",
    ]);
    expect(pathsFromToolInput({ cellPath: "n.ipynb" })).toEqual(["n.ipynb"]);
    expect(
      pathsFromToolInput({ edit: { path: "nested.ts", new_string: "x" } }),
    ).toEqual(["nested.ts"]);
  });

  it("path arrays + nested args + vscode-file URI (v1.1.61)", () => {
    expect(pathsFromToolInput({ files: ["a.ts", "b.ts"] })).toEqual([
      "a.ts",
      "b.ts",
    ]);
    expect(pathsFromToolInput({ paths: ["a.ts"] })).toEqual(["a.ts"]);
    expect(pathsFromToolInput({ filePaths: ["x.ts"] })).toEqual(["x.ts"]);
    expect(pathsFromToolInput({ target_files: ["t.ts"] })).toEqual(["t.ts"]);
    expect(pathsFromToolInput({ args: { path: "nested-args.ts" } })).toEqual([
      "nested-args.ts",
    ]);
    expect(
      pathsFromToolInput({ parameters: { file_path: "nested-params.ts" } }),
    ).toEqual(["nested-params.ts"]);
    expect(
      pathsFromToolInput({
        uri: "vscode-file://vscode-app/c:/work/a.ts",
      }),
    ).toEqual(["c:/work/a.ts"]);
  });

  it("content aliases new_content / code / value / data (v1.1.58)", () => {
    expect(
      contentSnippetsFromToolInput({ path: "a.ts", new_content: "nc" })[0]
        ?.content,
    ).toBe("nc");
    expect(
      contentSnippetsFromToolInput({ path: "a.ts", code: "code body" })[0]
        ?.content,
    ).toBe("code body");
    expect(
      contentSnippetsFromToolInput({ path: "a.ts", value: "val" })[0]?.content,
    ).toBe("val");
    expect(
      contentSnippetsFromToolInput({ path: "a.ts", data: "datax" })[0]?.content,
    ).toBe("datax");
    expect(pathsFromToolInput({ documentUri: "file:///tmp/x.ts" })).toEqual([
      "/tmp/x.ts",
    ]);
  });

  it("parses *** Updated File: past tense (v1.1.53)", () => {
    expect(pathsFromApplyPatchText("*** Updated File: src/x.ts\n@@\n")).toEqual([
      "src/x.ts",
    ]);
  });

  it("path aliases fileName / fullPath / from-to (v1.1.54)", () => {
    expect(pathsFromToolInput({ fileName: "a.ts" })).toEqual(["a.ts"]);
    expect(pathsFromToolInput({ file_name: "b.ts" })).toEqual(["b.ts"]);
    expect(pathsFromToolInput({ relative_path: "c.ts" })).toEqual(["c.ts"]);
    expect(pathsFromToolInput({ fullPath: "/tmp/d.ts" })).toEqual(["/tmp/d.ts"]);
    expect(pathsFromToolInput({ fsPath: "e.ts" })).toEqual(["e.ts"]);
    expect(pathsFromToolInput({ from: "a.ts", to: "b.ts" })).toEqual([
      "a.ts",
      "b.ts",
    ]);
    expect(
      pathsFromToolInput({ old_path: "old.ts", new_path: "new.ts" }),
    ).toEqual(["old.ts", "new.ts"]);
  });

  it("path aliases file:// URI and documentPath (v1.1.55)", () => {
    expect(pathsFromToolInput({ documentPath: "a.ts" })).toEqual(["a.ts"]);
    expect(pathsFromToolInput({ resourcePath: "b.ts" })).toEqual(["b.ts"]);
    expect(pathsFromToolInput({ uri: "file:///tmp/c.ts" })).toEqual([
      "/tmp/c.ts",
    ]);
    expect(pathsFromToolInput({ url: "file:///tmp/d.ts" })).toEqual([
      "/tmp/d.ts",
    ]);
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

describe("hashline MultiEdit per-entry old_string (v1.1.24)", () => {
  it("denies MultiEdit when edits[].old_string is stale after Read", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const a = path.join(ws, "a.ts");
    fs.writeFileSync(a, "export const a = 1;\n", "utf8");
    const input = base(ws);
    recordRead(input, c, a);
    const deny = hashlinePreToolDeny(
      {
        ...input,
        toolName: "MultiEdit",
        toolInput: {
          edits: [
            {
              path: a,
              old_string: "export const a = 999;",
              new_string: "export const a = 2;",
            },
          ],
        },
      },
      c,
    );
    expect(deny).toMatch(/old_string not found|stale/i);
  });

  it("denies MultiEdit empty old_string on existing file even after Read", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const a = path.join(ws, "a.ts");
    fs.writeFileSync(a, "export const a = 1;\n", "utf8");
    const input = base(ws);
    recordRead(input, c, a);
    const deny = hashlinePreToolDeny(
      {
        ...input,
        toolName: "MultiEdit",
        toolInput: {
          edits: [{ path: a, old_string: "", new_string: "export const a = 2;\n" }],
        },
      },
      c,
    );
    expect(deny).toMatch(/empty old_string/i);
  });

  it("allows MultiEdit with exact edits[].old_string after Read", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const a = path.join(ws, "a.ts");
    fs.writeFileSync(a, "export const a = 1;\n", "utf8");
    const input = base(ws);
    recordRead(input, c, a);
    expect(
      hashlinePreToolDeny(
        {
          ...input,
          toolName: "MultiEdit",
          toolInput: {
            edits: [
              {
                path: a,
                old_string: "export const a = 1;",
                new_string: "export const a = 2;",
              },
            ],
          },
        },
        c,
      ),
    ).toBeNull();
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

describe("hashline pathless mutating fail-closed (v1.1.31)", () => {
  it("denies ApplyPatch when body has no parseable paths", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const deny = hashlinePreToolDeny(
      base(ws, {
        toolName: "ApplyPatch",
        toolInput: { patch: "*** Begin Patch\n@@ garbage only\n*** End Patch\n" },
      }),
      c,
    );
    expect(deny).toMatch(/no file path|Hashline/i);
  });

  it("denies StrReplace/Write without path (bypass was allow)", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    for (const toolName of ["StrReplace", "Write", "search_replace", "CreateFile"]) {
      const deny = hashlinePreToolDeny(
        base(ws, {
          toolName,
          toolInput: { old_string: "a", new_string: "b", contents: "x" },
        }),
        c,
      );
      expect(deny, toolName).toMatch(/no file path|Hashline/i);
    }
  });

  it("denies Delete without path", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const deny = hashlinePreToolDeny(
      base(ws, { toolName: "DeleteFile", toolInput: {} }),
      c,
    );
    expect(deny).toMatch(/no file path|Hashline/i);
  });

  it("still allows hashline off pathless (config kill-switch)", () => {
    const ws = tmpWorkspace();
    const c = { ...cfg(path.join(ws, "pdata")), hashline: false };
    const deny = hashlinePreToolDeny(
      base(ws, { toolName: "Write", toolInput: { contents: "x" } }),
      c,
    );
    expect(deny).toBeNull();
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
