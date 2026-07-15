/**
 * init-deep.ts dedicated suite (MAGI v0.24).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  detectInitDeep,
  initDeepContext,
  parseInitDeepOpts,
  runInitDeep,
} from "../src/features/init-deep.js";

const tmpRoots: string[] = [];

function tmpWorkspace(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "omg-initd-"));
  tmpRoots.push(d);
  return d;
}

afterEach(() => {
  for (const d of tmpRoots.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

function writeFile(p: string, body = "export const x = 1;\n"): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body, "utf8");
}

describe("detectInitDeep / parseInitDeepOpts", () => {
  it("detects /init-deep only at line start", () => {
    expect(detectInitDeep("/init-deep")).toBe(true);
    expect(detectInitDeep("  /init-deep --max-depth=2")).toBe(true);
    expect(detectInitDeep("/INIT-DEEP")).toBe(true);
    expect(detectInitDeep("please /init-deep")).toBe(false);
    expect(detectInitDeep("init deep")).toBe(false);
  });

  it("parses max-depth cap and create-new", () => {
    expect(parseInitDeepOpts("/init-deep")).toEqual({
      maxDepth: 3,
      createNew: false,
    });
    expect(parseInitDeepOpts("/init-deep --max-depth=5 --create-new")).toEqual({
      maxDepth: 5,
      createNew: true,
    });
    expect(parseInitDeepOpts("/init-deep --max-depth=99").maxDepth).toBe(8);
    expect(parseInitDeepOpts("/init-deep --max-depth=0").maxDepth).toBe(3);
  });
});

describe("runInitDeep", () => {
  it("creates root AGENTS.md always", () => {
    const ws = tmpWorkspace();
    const r = runInitDeep(ws, { maxDepth: 1, createNew: true });
    expect(r.created.some((f) => f.endsWith("AGENTS.md"))).toBe(true);
    const root = path.join(ws, "AGENTS.md");
    expect(fs.existsSync(root)).toBe(true);
    expect(fs.readFileSync(root, "utf8")).toMatch(/oh-my-grok|AGENTS/);
  });

  it("creates nested AGENTS.md only for code dirs", () => {
    const ws = tmpWorkspace();
    writeFile(path.join(ws, "src", "a.ts"));
    writeFile(path.join(ws, "empty-docs", "readme.txt"), "docs only\n");
    const r = runInitDeep(ws, { maxDepth: 3, createNew: true });
    expect(r.created.some((f) => f.includes(`${path.sep}src${path.sep}`) || f.endsWith(`src${path.sep}AGENTS.md`))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(ws, "src", "AGENTS.md"))).toBe(true);
    expect(fs.existsSync(path.join(ws, "empty-docs", "AGENTS.md"))).toBe(false);
  });

  it("skips node_modules / dist / .git", () => {
    const ws = tmpWorkspace();
    writeFile(path.join(ws, "node_modules", "pkg", "index.js"));
    writeFile(path.join(ws, "dist", "cli.js"));
    writeFile(path.join(ws, "src", "ok.ts"));
    runInitDeep(ws, { maxDepth: 4, createNew: true });
    expect(fs.existsSync(path.join(ws, "node_modules", "AGENTS.md"))).toBe(false);
    expect(fs.existsSync(path.join(ws, "dist", "AGENTS.md"))).toBe(false);
    expect(fs.existsSync(path.join(ws, "src", "AGENTS.md"))).toBe(true);
  });

  it("skips hand-written AGENTS.md (>80 chars, not omg stub)", () => {
    const ws = tmpWorkspace();
    writeFile(path.join(ws, "src", "a.ts"));
    const custom = "# Custom team rules\n\n" + "x".repeat(100) + "\n";
    fs.mkdirSync(path.join(ws, "src"), { recursive: true });
    fs.writeFileSync(path.join(ws, "src", "AGENTS.md"), custom, "utf8");
    const r = runInitDeep(ws, { maxDepth: 3, createNew: true });
    expect(r.skipped.some((f) => f.endsWith(`src${path.sep}AGENTS.md`) || f.includes("src"))).toBe(
      true,
    );
    expect(fs.readFileSync(path.join(ws, "src", "AGENTS.md"), "utf8")).toBe(custom);
  });

  it("createNew:false never overwrites existing", () => {
    const ws = tmpWorkspace();
    const rootAgents = path.join(ws, "AGENTS.md");
    fs.writeFileSync(rootAgents, "keep me\n", "utf8");
    const r = runInitDeep(ws, { maxDepth: 1, createNew: false });
    expect(r.skipped).toContain(rootAgents);
    expect(fs.readFileSync(rootAgents, "utf8")).toBe("keep me\n");
  });

  it("respects maxDepth on deep trees", () => {
    const ws = tmpWorkspace();
    writeFile(path.join(ws, "a", "b", "c", "d.ts"));
    const r = runInitDeep(ws, { maxDepth: 1, createNew: true });
    // root + a (depth 1); not a/b (depth 2)
    expect(fs.existsSync(path.join(ws, "AGENTS.md"))).toBe(true);
    expect(fs.existsSync(path.join(ws, "a", "AGENTS.md"))).toBe(true);
    expect(fs.existsSync(path.join(ws, "a", "b", "AGENTS.md"))).toBe(false);
    expect(r.maxDepth).toBe(1);
  });
});

describe("initDeepContext", () => {
  it("summarizes created / skipped", () => {
    const s = initDeepContext({
      created: ["/x/AGENTS.md"],
      skipped: ["/y/AGENTS.md"],
      maxDepth: 2,
    });
    expect(s).toMatch(/OMG_INIT_DEEP/);
    expect(s).toMatch(/Created 1/);
    expect(s).toMatch(/Skipped 1/);
    expect(s).toContain("/x/AGENTS.md");
  });
});
