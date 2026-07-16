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
