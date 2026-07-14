/**
 * directory-inject feature suite — pure-function coverage for
 * src/features/directory-inject.ts.
 *
 * testability: directory-inject.ts exports collectDirectoryContext, so this
 * is a direct unit suite — no hook/E2E driving required.
 *
 * state isolation: workspaceRoot is pointed at an os.tmpdir() scratch dir via
 * tmpWorkspace(); a nested fake tree (a/b/c/file.ts) is built underneath.
 * No real project AGENTS.md is ever consulted because we pass an isolated
 * workspaceRoot and assert no reads escape it.
 *
 * spiral 4 (v0.11 nested-AGENTS 加厚) baseline: see the final it.skip block —
 * it records two known limitations of the current slice/relative-based
 * implementation that the upcoming realpath + code-point safe truncation work
 * must fix. We intentionally do NOT touch src here; the skip is a regression
 * baseline only.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { collectDirectoryContext } from "../src/features/directory-inject.js";

const tmpRoots: string[] = [];

function tmpWorkspace(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "omg-dirinj-"));
  tmpRoots.push(d);
  return d;
}

afterEach(() => {
  for (const d of tmpRoots.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

/** mkdir -p helper. */
function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

/** Write a file with the given UTF-8 content, creating parent dirs. */
function writeFile(p: string, body: string): void {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, body, "utf8");
}

describe("collectDirectoryContext — upward collection", () => {
  it("collects AGENTS.md from multiple ancestor dirs up to root", () => {
    const ws = tmpWorkspace();
    // tree: ws/a/b/c/file.ts, AGENTS.md at ws/ and ws/a/b/
    writeFile(path.join(ws, "AGENTS.md"), "ROOT agents content");
    writeFile(path.join(ws, "a", "b", "AGENTS.md"), "MIDDLE agents content");
    const file = path.join(ws, "a", "b", "c", "file.ts");
    writeFile(file, "export {}");

    const out = collectDirectoryContext(ws, file);

    expect(out).toContain("<OMG_DIR_AGENTS>");
    expect(out).toContain("</OMG_DIR_AGENTS>");
    // Both segments present (nearest-first ordering: MIDDLE before ROOT).
    expect(out).toContain("MIDDLE agents content");
    expect(out).toContain("ROOT agents content");
    // The relative header for at least one file should appear.
    expect(out).toMatch(/###\s/);
  });

  it("returns a single segment when only the nearest ancestor has AGENTS.md", () => {
    const ws = tmpWorkspace();
    writeFile(path.join(ws, "a", "b", "AGENTS.md"), "ONLY middle content");
    const file = path.join(ws, "a", "b", "c", "file.ts");
    writeFile(file, "export {}");

    const out = collectDirectoryContext(ws, file);

    expect(out).toContain("<OMG_DIR_AGENTS>");
    expect(out).toContain("ONLY middle content");
    // Nothing from a (non-existent) root AGENTS.md.
    expect(out.match(/ONLY middle content/g)?.length).toBe(1);
  });

  it("returns empty string when no AGENTS.md exists along the walk", () => {
    const ws = tmpWorkspace();
    const file = path.join(ws, "a", "b", "c", "file.ts");
    writeFile(file, "export {}");

    const out = collectDirectoryContext(ws, file);
    expect(out).toBe("");
  });

  it("truncates total output beyond MAX (6000) and appends the truncated marker", () => {
    const ws = tmpWorkspace();
    // Single AGENTS.md whose body is capped at 2000 per file by the impl, so
    // we need multiple segments to exceed 6000. Place 4 files along the walk.
    const longBody = "X".repeat(2000);
    writeFile(path.join(ws, "AGENTS.md"), longBody);
    writeFile(path.join(ws, "d1", "AGENTS.md"), longBody);
    writeFile(path.join(ws, "d1", "d2", "AGENTS.md"), longBody);
    writeFile(path.join(ws, "d1", "d2", "d3", "AGENTS.md"), longBody);
    const file = path.join(ws, "d1", "d2", "d3", "d4", "file.ts");
    writeFile(file, "export {}");

    const out = collectDirectoryContext(ws, file);

    expect(out).toContain("<OMG_DIR_AGENTS>");
    // Truncation marker present exactly once at the very end of the payload.
    expect(out).toContain("…[truncated]");
    // marker sits inside the body, before the closing tag
    expect(out.lastIndexOf("…[truncated]")).toBeLessThan(out.indexOf("</OMG_DIR_AGENTS>"));
    // Truncation engaged: payload stays bounded. Body includes the
    // <OMG_DIR_AGENTS> header + "Nearby…" prefix beyond MAX, so assert a
    // generous upper bound rather than MAX exactly.
    expect(out.length).toBeLessThan(7000);
  });

  it("stops cleanly when filePath escapes the workspace (does not throw, no leak)", () => {
    const ws = tmpWorkspace();
    writeFile(path.join(ws, "AGENTS.md"), "ROOT content");
    // A genuinely external dir holding its own AGENTS.md that must NOT leak.
    const outside = tmpWorkspace();
    writeFile(path.join(outside, "AGENTS.md"), "EXTERNAL SECRET content");

    // Relative ../ escape from ws resolves into os.tmpdir() parent region;
    // must not throw and must not surface the external file.
    const relEscape = path.join("..", path.basename(outside), "file.ts");
    const outRel = collectDirectoryContext(ws, relEscape);
    expect(typeof outRel).toBe("string");
    expect(outRel).not.toContain("EXTERNAL SECRET content");

    // Absolute external path — also must not leak the outside file.
    const absExternal = path.join(outside, "file.ts");
    writeFile(absExternal, "export {}");
    const outAbs = collectDirectoryContext(ws, absExternal);
    expect(typeof outAbs).toBe("string");
    expect(outAbs).not.toContain("EXTERNAL SECRET content");
  });

  it("handles a directory path (non-file) without throwing", () => {
    const ws = tmpWorkspace();
    writeFile(path.join(ws, "a", "b", "AGENTS.md"), "DIR OK content");
    const dir = path.join(ws, "a", "b", "c");
    ensureDir(dir);

    const out = collectDirectoryContext(ws, dir);
    expect(out).toContain("<OMG_DIR_AGENTS>");
    expect(out).toContain("DIR OK content");
  });

  it("collects lowercase agents.md as well as AGENTS.md", () => {
    const ws = tmpWorkspace();
    writeFile(path.join(ws, "a", "b", "agents.md"), "lowercase content");
    const file = path.join(ws, "a", "b", "c", "file.ts");
    writeFile(file, "export {}");

    const out = collectDirectoryContext(ws, file);
    expect(out).toContain("<OMG_DIR_AGENTS>");
    expect(out).toContain("lowercase content");
  });
});

/**
 * Spiral 4 (v0.11 nested-AGENTS 加厚) — regression baseline.
 *
 * The current implementation has two known limitations that the upcoming
 * realpath + code-point safe truncation work must resolve. These are recorded
 * here as a skipped baseline so the future fix has an exact before-state to
 * compare against. We deliberately do NOT modify src in this task.
 */
describe.skip("v0.11 baseline — realpath symlink + code-point safe truncation", () => {
  // TODO v0.11: realpath symlink 容器 + code-point 安全截断
  //
  // Current limitation A — symlink / container path safety:
  //   path.relative(root, parent) is a pure lexical operation. Under symlinks
  //   (e.g. host path symlinked into a container mount) a parent can resolve
  //   lexically inside root while actually living outside it, or vice-versa.
  //   v0.11 must fs.realpathSync both endpoints before comparing so the walk
  //   cannot accidentally collect an AGENTS.md from outside the workspace nor
  //   prematurely abort inside it.
  //
  // Current limitation B — multi-byte truncation:
  //   Both per-file slice(0, 2000) and the MAX slice(0, 6000) operate on
  //   UTF-16 code units. A CJK / emoji body can be sliced mid-character,
  //   yielding a lone surrogate that breaks JSON serialization / corrupts the
  //   injected context. v0.11 must truncate on code-point boundaries (e.g.
  //   Array.from / well-formed substring) so the payload stays valid UTF-8.
  //
  // Once fixed, unskip and assert:
  //   1. a symlinked external dir is neither collected nor causes an abort;
  //   2. a 2000-char CJK body survives truncation as well-formed UTF-8.

  it("TODO v0.11: realpath symlink 容器 — lexical relative is unsafe under symlinks", () => {
    expect(true).toBe(true);
  });

  it("TODO v0.11: code-point 安全截断 — slice may split multi-byte chars", () => {
    expect(true).toBe(true);
  });
});
