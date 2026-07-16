# Path Boundary Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用统一的真实路径边界判断消除 Prometheus 计划写入绕过，并让目录规则注入复用同一安全原语。

**Architecture:** 新增 `src/state/path-boundary.ts`，把“最近存在祖先 realpath 规范化”和“跨平台目录包含判断”集中在一个无业务文案的模块中。Prometheus 的 role deny、plan-mode deny、Skill Gate skip 共用上下文感知判断；目录注入只复用规范化和包含原语，保持软注入错误时返回空字符串。

**Tech Stack:** TypeScript 5、Node.js 20+ 内置 `fs` / `path`、Vitest 3、提交式 `dist/` 构建产物。

---

## File Map

| File | Responsibility |
|------|----------------|
| Create `src/state/path-boundary.ts` | 规范化存在或尚不存在的目标，并执行可注入 path flavor 的包含判断 |
| Create `tests/path-boundary.test.ts` | 锁定 POSIX、Windows、UNC、新路径和链接边界语义 |
| Modify `src/features/prometheus.ts` | 将三个计划路径调用点统一到真实 `plansDir` 边界 |
| Modify `tests/prometheus.test.ts` | 验证合法路径、非法路径矩阵、MultiEdit 和 Skill Gate skip |
| Modify `tests/pre-tool-orchestration.test.ts` | 证明路径穿越由 plan-mode 最先拒绝，而不是落入 Hashline |
| Modify `src/features/directory-inject.ts` | 删除局部 realpath/contains 实现并复用共享模块 |
| Modify `tests/directory-inject.test.ts` | 用真实 junction/symlink 和 `..safe` 目录替换永久 skip |
| Modify `docs/contract.md` | 明确 plan-only 使用规范化后的真实路径边界 |
| Generate `dist/state/*`, `dist/features/*` | 保持 GitHub 直装所需的提交式 JavaScript、声明和 sourcemap 与源码一致 |

## Task 1: Shared Path Boundary Module

**Files:**
- Create: `tests/path-boundary.test.ts`
- Create: `src/state/path-boundary.ts`
- Generate: `dist/state/path-boundary.js`
- Generate: `dist/state/path-boundary.js.map`
- Generate: `dist/state/path-boundary.d.ts`

- [ ] **Step 1: Write the failing path-boundary tests**

Create `tests/path-boundary.test.ts` with the complete suite below:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  canonicalizeTargetPath,
  isPathInside,
  isTargetInside,
} from "../src/state/path-boundary.js";

const tmpRoots: string[] = [];

function tmpRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "omg-boundary-"));
  tmpRoots.push(root);
  return root;
}

function directoryLinkType(): "junction" | "dir" {
  return process.platform === "win32" ? "junction" : "dir";
}

afterEach(() => {
  for (const root of tmpRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("canonicalizeTargetPath", () => {
  it("rebuilds a missing target from its nearest real ancestor", () => {
    const root = tmpRoot();
    const expectedRoot = fs.realpathSync.native(root);

    expect(canonicalizeTargetPath(root, path.join("plans", "new.md"))).toBe(
      path.join(expectedRoot, "plans", "new.md"),
    );
  });

  it("returns null for empty inputs", () => {
    expect(canonicalizeTargetPath("", "x.md")).toBeNull();
    expect(canonicalizeTargetPath(process.cwd(), "")).toBeNull();
  });
});

describe("isPathInside", () => {
  it("accepts self, descendants, and legal names beginning with two dots", () => {
    const root = tmpRoot();
    expect(isPathInside(root, root)).toBe(true);
    expect(isPathInside(root, path.join(root, "child", "x.md"))).toBe(true);
    expect(isPathInside(root, path.join(root, "..safe", "x.md"))).toBe(true);
  });

  it("rejects parent traversal and sibling prefixes", () => {
    const root = tmpRoot();
    expect(isPathInside(root, path.join(root, "..", "outside", "x.md"))).toBe(false);
    expect(isPathInside(root, `${root}-evil${path.sep}x.md`)).toBe(false);
  });

  it("rejects Windows drive and UNC root changes without real disks", () => {
    expect(
      isPathInside(
        String.raw`C:\repo\.omg\plans`,
        String.raw`D:\repo\.omg\plans\x.md`,
        path.win32,
      ),
    ).toBe(false);
    expect(
      isPathInside(
        String.raw`\\server\share\repo`,
        String.raw`\\other\share\repo\x.md`,
        path.win32,
      ),
    ).toBe(false);
  });

  it("rejects an external POSIX root through the injected flavor", () => {
    expect(isPathInside("/repo/.omg/plans", "/outside/x.md", path.posix)).toBe(false);
  });
});

describe("isTargetInside", () => {
  it("allows a boundary and target that do not exist yet", () => {
    const root = tmpRoot();
    expect(
      isTargetInside({
        boundary: path.join(root, ".omg", "plans"),
        baseDir: root,
        target: path.join(root, ".omg", "plans", "new.md"),
      }),
    ).toBe(true);
  });

  it("rejects a descendant link that escapes the boundary", () => {
    const root = tmpRoot();
    const plans = path.join(root, "plans");
    const outside = path.join(root, "outside");
    fs.mkdirSync(plans);
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(plans, "escape"), directoryLinkType());

    expect(
      isTargetInside({
        boundary: plans,
        baseDir: root,
        target: path.join(plans, "escape", "new.md"),
      }),
    ).toBe(false);
  });

  it("allows a descendant link whose real target remains inside", () => {
    const root = tmpRoot();
    const plans = path.join(root, "plans");
    const nested = path.join(plans, "nested");
    fs.mkdirSync(nested, { recursive: true });
    fs.symlinkSync(nested, path.join(plans, "inside"), directoryLinkType());

    expect(
      isTargetInside({
        boundary: plans,
        baseDir: root,
        target: path.join(plans, "inside", "new.md"),
      }),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run the new suite and verify the red state**

Run:

```bash
npm test -- tests/path-boundary.test.ts
```

Expected: FAIL during module resolution because `src/state/path-boundary.ts` does not exist.

- [ ] **Step 3: Implement the shared module**

Create `src/state/path-boundary.ts`:

```ts
import fs from "node:fs";
import path from "node:path";

export type PathFlavor = Pick<typeof path, "relative" | "isAbsolute" | "sep">;

export interface TargetBoundaryCheck {
  boundary: string;
  baseDir: string;
  target: string;
}

function pathEntryExists(file: string): boolean {
  try {
    fs.lstatSync(file);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return false;
    throw error;
  }
}

/** 解析最近存在祖先的真实路径，并保留尚未创建的尾部片段。 */
export function canonicalizeTargetPath(baseDir: string, target: string): string | null {
  if (!baseDir.trim() || !target.trim()) return null;

  try {
    const resolved = path.resolve(baseDir, target);
    const suffix: string[] = [];
    let cursor = resolved;

    while (!pathEntryExists(cursor)) {
      const parent = path.dirname(cursor);
      if (parent === cursor) return null;
      suffix.unshift(path.basename(cursor));
      cursor = parent;
    }

    const realAncestor = fs.realpathSync.native(cursor);
    return path.resolve(realAncestor, ...suffix);
  } catch {
    return null;
  }
}

/** 比较规范化绝对路径；不同盘符或 UNC 根产生绝对 relative，必须拒绝。 */
export function isPathInside(
  parent: string,
  candidate: string,
  pathFlavor: PathFlavor = path,
): boolean {
  if (!parent || !candidate) return false;
  const relative = pathFlavor.relative(parent, candidate);
  return (
    relative === "" ||
    (!pathFlavor.isAbsolute(relative) &&
      relative !== ".." &&
      !relative.startsWith(`..${pathFlavor.sep}`))
  );
}

export function isTargetInside(check: TargetBoundaryCheck): boolean {
  const boundary = canonicalizeTargetPath(check.baseDir, check.boundary);
  const target = canonicalizeTargetPath(check.baseDir, check.target);
  return boundary !== null && target !== null && isPathInside(boundary, target);
}
```

- [ ] **Step 4: Verify the green state and generated artifacts**

Run:

```bash
npm test -- tests/path-boundary.test.ts
npm run typecheck
npm run build
```

Expected: the new suite reports 9 passing tests, typecheck exits 0, and `dist/state/path-boundary.{js,js.map,d.ts}` exists.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/state/path-boundary.ts tests/path-boundary.test.ts dist/state/path-boundary.js dist/state/path-boundary.js.map dist/state/path-boundary.d.ts
git commit -m "feat: add canonical path boundary checks"
```

## Task 2: Prometheus Hard-Gate Integration

**Files:**
- Modify: `tests/prometheus.test.ts`
- Modify: `tests/pre-tool-orchestration.test.ts`
- Modify: `src/features/prometheus.ts`
- Generate: `dist/features/prometheus.js`
- Generate: `dist/features/prometheus.js.map`
- Generate: `dist/features/prometheus.d.ts`

- [ ] **Step 1: Add the failing Prometheus path matrix**

Add this helper near the existing `base` helper in `tests/prometheus.test.ts`:

```ts
function rawPath(...parts: string[]): string {
  return parts.join(path.sep);
}
```

Add this describe block after the existing `prometheusRoleDeny + plan-only skill skip` block:

```ts
describe("canonical plan path boundary", () => {
  it("allows relative, absolute, and custom-state plan targets", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    startPlanMode(input, c, "valid paths");

    for (const target of [
      path.join(".omg", "plans", "relative.md"),
      path.join(ws, ".omg", "plans", "absolute.md"),
    ]) {
      expect(planModeDeny({ ...input, toolInput: { path: target } }, c)).toBeNull();
      expect(
        prometheusRoleDeny(
          { ...input, toolInput: { path: target } },
          c,
          "prometheus",
        ),
      ).toBeNull();
    }

    const relativeCustom = cfg(path.join(ws, "relative-pdata"), {
      stateDirName: ".custom",
    });
    const relativeInput = base(ws, { sessionId: "relative-state" });
    const relativePm = startPlanMode(relativeInput, relativeCustom, "relative state");
    expect(
      planModeDeny(
        { ...relativeInput, toolInput: { path: relativePm.planFile! } },
        relativeCustom,
      ),
    ).toBeNull();

    const absoluteRoot = path.join(tmpWorkspace(), "custom-state");
    const absoluteCustom = cfg(path.join(ws, "absolute-pdata"), {
      stateDirName: absoluteRoot,
    });
    const absoluteInput = base(ws, { sessionId: "absolute-state" });
    const absolutePm = startPlanMode(absoluteInput, absoluteCustom, "absolute state");
    expect(
      planModeDeny(
        { ...absoluteInput, toolInput: { path: absolutePm.planFile! } },
        absoluteCustom,
      ),
    ).toBeNull();
  });

  it("allows the first plan target before plansDir exists", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    const firstPlan = path.join(ws, ".omg", "plans", "first.md");

    expect(fs.existsSync(path.dirname(firstPlan))).toBe(false);
    expect(
      prometheusRoleDeny(
        { ...input, toolInput: { path: firstPlan, contents: "# first\n" } },
        c,
        "prometheus",
      ),
    ).toBeNull();
  });

  it("rejects every lexical escape in both denies and the skill skip", () => {
    const ws = tmpWorkspace();
    const outside = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    startPlanMode(input, c, "invalid paths");

    const otherRoot =
      process.platform === "win32"
        ? path.parse(ws).root.toLowerCase().startsWith("c:")
          ? "D:\\"
          : "C:\\"
        : path.parse(outside).root;
    const invalid = [
      rawPath(ws, ".omg", "plans", "..", "..", "src", "app.ts"),
      path.join(outside, ".omg", "plans", "external.md"),
      path.join(ws, ".omg", "plans-evil", "sibling.md"),
      path.join(ws, "src", "plan-mode.json"),
      path.join(otherRoot, "outside", ".omg", "plans", "cross-root.md"),
    ];

    for (const target of invalid) {
      const toolInput = { path: target, contents: "# plan\n" };
      expect(planModeDeny({ ...input, toolInput }, c)).toMatch(/plan-mode|plans/i);
      expect(
        prometheusRoleDeny({ ...input, toolInput }, c, "prometheus"),
      ).toMatch(/PROMETHEUS_ROLE|plan-only/i);
      expect(isPlanModePlanOnlyWrite({ ...input, toolInput }, c)).toBe(false);
    }
  });

  it("rejects a plan descendant link that escapes the boundary", () => {
    const ws = tmpWorkspace();
    const outside = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    startPlanMode(input, c, "link escape");
    const link = path.join(ws, ".omg", "plans", "escape");
    fs.symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
    const toolInput = { path: path.join(link, "outside.md"), contents: "# no\n" };

    expect(planModeDeny({ ...input, toolInput }, c)).toMatch(/plan-mode|plans/i);
    expect(prometheusRoleDeny({ ...input, toolInput }, c, "prometheus")).toMatch(
      /PROMETHEUS_ROLE|plan-only/i,
    );
    expect(isPlanModePlanOnlyWrite({ ...input, toolInput }, c)).toBe(false);
  });

  it("rejects a mixed MultiEdit batch", () => {
    const ws = tmpWorkspace();
    const c = cfg(path.join(ws, "pdata"));
    const input = base(ws);
    const pm = startPlanMode(input, c, "batch");
    const escaped = rawPath(ws, ".omg", "plans", "..", "..", "src", "app.ts");
    const toolInput = {
      edits: [
        { path: pm.planFile!, old_string: "# Plan", new_string: "# Updated" },
        { path: escaped, old_string: "old", new_string: "new" },
      ],
    };

    expect(planModeDeny({ ...input, toolInput }, c)).toMatch(/plan-mode|plans/i);
    expect(prometheusRoleDeny({ ...input, toolInput }, c, "prometheus")).toMatch(
      /PROMETHEUS_ROLE|plan-only/i,
    );
    expect(isPlanModePlanOnlyWrite({ ...input, toolInput }, c)).toBe(false);
  });
});
```

On POSIX, `otherRoot` can be the same `/` root, but the separate outside absolute-path case already exercises the native cross-boundary behavior. The `path.win32` different-root branch is proven independently in Task 1.

- [ ] **Step 2: Add the failing PreTool ordering regression**

Add this test immediately after the existing plan-mode ordering test in `tests/pre-tool-orchestration.test.ts`:

```ts
it("2b. plan-mode catches traversal before hashline", () => {
  const ws = tmpWorkspace();
  const data = path.join(ws, "pdata");
  const file = path.join(ws, "src", "app.ts");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "export const a = 1;\n", "utf8");
  const c = cfg(data, { agentGuard: false, planMode: true, hashline: true });
  startPlanMode(base(ws), c, "traversal");
  const traversal = [ws, ".omg", "plans", "..", "..", "src", "app.ts"].join(
    path.sep,
  );

  const r = handlePreToolUse(
    base(ws, {
      toolName: "Write",
      toolInput: { path: traversal, contents: "export const a = 2;\n" },
    }),
    c,
  );

  expect(r.exitCode).toBe(2);
  const json = JSON.stringify(r.output);
  expect(json).toMatch(/plan-mode|Prometheus/i);
  expect(json).not.toMatch(/Hashline/i);
});
```

- [ ] **Step 3: Run the focused suites and verify the red state**

Run:

```bash
npm test -- tests/prometheus.test.ts tests/pre-tool-orchestration.test.ts
```

Expected: FAIL because traversal, external `.omg/plans`, `plan-mode.json`, and link targets are still accepted by the string predicate; the PreTool regression reports Hashline rather than Prometheus.

- [ ] **Step 4: Replace the Prometheus string predicate**

Add this import to `src/features/prometheus.ts`:

```ts
import { isTargetInside } from "../state/path-boundary.js";
```

Replace `isPlanWritePath` with:

```ts
export function isPlanWritePath(
  input: HookInput,
  cfg: EnvConfig,
  file: string,
): boolean {
  if (!file?.trim()) return false;
  const plansDir = pathsFor(input.workspaceRoot, input.sessionId, cfg).plansDir;
  return isTargetInside({
    boundary: plansDir,
    baseDir: input.workspaceRoot || input.cwd,
    target: file,
  });
}
```

Replace the three collection callbacks exactly as follows:

```ts
return paths.every((file) => isPlanWritePath(input, cfg, file));
```

```ts
const blocked = paths.filter((file) => !isPlanWritePath(input, cfg, file));
```

The second snippet appears in both `planModeDeny` and `prometheusRoleDeny`. Do not retain the `plan-mode.json` suffix exception.

- [ ] **Step 5: Verify the Prometheus green state and build output**

Run:

```bash
npm test -- tests/prometheus.test.ts tests/pre-tool-orchestration.test.ts tests/path-boundary.test.ts
npm run typecheck
npm run build
```

Expected: all focused suites pass, typecheck exits 0, and only the expected Prometheus/path-boundary build artifacts change.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/features/prometheus.ts tests/prometheus.test.ts tests/pre-tool-orchestration.test.ts dist/features/prometheus.js dist/features/prometheus.js.map dist/features/prometheus.d.ts
git commit -m "fix: enforce canonical prometheus plan paths"
```

## Task 3: Directory Injection Migration

**Files:**
- Modify: `tests/directory-inject.test.ts`
- Modify: `src/features/directory-inject.ts`
- Generate: `dist/features/directory-inject.js`
- Generate: `dist/features/directory-inject.js.map`
- Generate: `dist/features/directory-inject.d.ts`

- [ ] **Step 1: Replace the skipped baseline with behavior tests**

Add this test inside the existing upward-collection describe block in `tests/directory-inject.test.ts`:

```ts
it("accepts a legal directory name beginning with two dots", () => {
  const ws = tmpWorkspace();
  writeFile(path.join(ws, "..safe", "AGENTS.md"), "DOT SAFE content");
  const file = path.join(ws, "..safe", "child", "file.ts");
  writeFile(file, "export {}");

  const out = collectDirectoryContext(ws, file);
  expect(out).toContain("DOT SAFE content");
});

it("keeps treating a missing target as a directory", () => {
  const ws = tmpWorkspace();
  writeFile(path.join(ws, "a", "AGENTS.md"), "MISSING DIR content");
  const missingDir = path.join(ws, "a", "missing", "child");

  const out = collectDirectoryContext(ws, missingDir);
  expect(out).toContain("MISSING DIR content");
});
```

Delete the final skipped describe block and replace it with:

```ts
describe("realpath symlink containment", () => {
  it("does not collect AGENTS.md through an external directory link", () => {
    const ws = tmpWorkspace();
    const outside = tmpWorkspace();
    writeFile(path.join(ws, "AGENTS.md"), "ROOT SAFE content");
    writeFile(path.join(outside, "AGENTS.md"), "EXTERNAL SECRET content");
    writeFile(path.join(outside, "file.ts"), "export {}");
    const link = path.join(ws, "linked-outside");
    fs.symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");

    const out = collectDirectoryContext(ws, path.join(link, "file.ts"));
    expect(out).toBe("");
    expect(out).not.toContain("EXTERNAL SECRET content");
  });
});
```

- [ ] **Step 2: Run the directory suite and verify the red state**

Run:

```bash
npm test -- tests/directory-inject.test.ts
```

Expected: FAIL on `..safe` because the old local `startsWith("..")` predicate rejects a legal descendant. The real link test must execute rather than appear as skipped.

- [ ] **Step 3: Migrate directory injection to the shared module**

In `src/features/directory-inject.ts`, delete the local `safeRealpath` and `isInside` functions, then add:

```ts
import { canonicalizeTargetPath, isPathInside } from "../state/path-boundary.js";
```

Replace `collectDirectoryContext` with:

```ts
export function collectDirectoryContext(
  workspaceRoot: string,
  filePath: string,
): string {
  if (!filePath || !workspaceRoot) return "";
  const rootReal = canonicalizeTargetPath(workspaceRoot, ".");
  const targetReal = canonicalizeTargetPath(workspaceRoot, filePath);
  if (!rootReal || !targetReal || !isPathInside(rootReal, targetReal)) return "";

  let dir = targetReal;
  try {
    if (fs.existsSync(targetReal) && fs.statSync(targetReal).isFile()) {
      dir = path.dirname(targetReal);
    }
  } catch {
    return "";
  }

  const chunks: string[] = [];
  let guard = 0;
  while (guard++ < 32 && isPathInside(rootReal, dir)) {
    for (const name of ["AGENTS.md", "agents.md"]) {
      const file = path.join(dir, name);
      if (fs.existsSync(file)) {
        try {
          const body = truncateByCodePoints(fs.readFileSync(file, "utf8"), 2000);
          chunks.push(`### ${path.relative(rootReal, file) || name}\n${body}`);
        } catch {
          /* 忽略不可读的目录规则文件。 */
        }
        break;
      }
    }
    if (dir === rootReal) break;
    const parent = path.dirname(dir);
    if (parent === dir || !isPathInside(rootReal, parent)) break;
    dir = parent;
  }
  if (!chunks.length) return "";
  let text = chunks.join("\n\n");
  if (text.length > MAX) text = truncateByCodePoints(text, MAX) + "\n…[truncated]";
  return `<OMG_DIR_AGENTS>\nNearby AGENTS.md for context:\n${text}\n</OMG_DIR_AGENTS>`;
}
```

- [ ] **Step 4: Verify the directory green state and build output**

Run:

```bash
npm test -- tests/directory-inject.test.ts tests/path-boundary.test.ts
npm run typecheck
npm run build
```

Expected: both suites pass with no skipped directory-injection test, typecheck exits 0, and the directory-inject dist artifacts match the source.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/features/directory-inject.ts tests/directory-inject.test.ts dist/features/directory-inject.js dist/features/directory-inject.js.map dist/features/directory-inject.d.ts
git commit -m "fix: share canonical directory containment"
```

## Task 4: Contract and Full Verification

**Files:**
- Modify: `docs/contract.md`
- Verify: `hooks/hooks.json`
- Verify: all `src/`, `tests/`, and generated `dist/`

- [ ] **Step 1: Clarify the host contract**

Add this paragraph immediately after the PreTool order list in `docs/contract.md`:

```markdown
Plan-only writes are checked against the configured `plansDir` after resolving the workspace base, nearest existing ancestor, and real filesystem paths. A lexical `.omg/plans/` substring alone never grants write access.
```

Do not reorder or renumber the existing PreTool list.

- [ ] **Step 2: Run focused security verification**

Run:

```bash
npm test -- tests/path-boundary.test.ts tests/prometheus.test.ts tests/pre-tool-orchestration.test.ts tests/directory-inject.test.ts tests/cli-failopen.test.ts
```

Expected: all five files pass; the directory suite reports no skipped test.

- [ ] **Step 3: Run the canonical full verification**

Run:

```bash
npm run ci
```

Expected: build, all Vitest files, doctor, and validate exit 0. The Vitest summary reports zero failed tests and no directory-injection skip.

- [ ] **Step 4: Audit artifacts and invariants**

Run:

```bash
git diff --check
rg -n "describe\.skip|it\.skip" tests/directory-inject.test.ts
git diff -- hooks/hooks.json src/events/pre-tool-use.ts
git status --short
```

Expected: `git diff --check` is empty; the skip search returns no matches; hook registration and PreTool order files have no diff; status contains only `docs/contract.md` before the final commit.

- [ ] **Step 5: Commit Task 4**

```bash
git add docs/contract.md
git commit -m "docs: define canonical plan path boundary"
```

- [ ] **Step 6: Verify the final branch state**

Run:

```bash
git status --short --branch
git log -5 --oneline --decorate
```

Expected: the worktree is clean and the branch contains the design, this implementation plan, and four implementation commits on top of the pulled remote baseline.
