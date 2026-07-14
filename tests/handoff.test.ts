/**
 * Handoff feature suite — pure-function coverage for src/features/handoff.ts.
 *
 * testability: handoff.ts exports all three public functions
 * (detectHandoff / writeHandoffStub / handoffContext), so this is a direct
 * unit suite — no E2E stdin driving required.
 *
 * state isolation: workspaceRoot + cfg.stateDirName are pointed at an
 * os.tmpdir() scratch dir via tmpWorkspace(), so no real project .omg/ is
 * ever touched. We do not rely on OMG_STATE_DIR to keep the suite
 * independent of config-loading side effects.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  detectHandoff,
  handoffContext,
  writeHandoffStub,
} from "../src/features/handoff.js";
import type { EnvConfig, HookInput } from "../src/protocol/types.js";

const tmpRoots: string[] = [];

function tmpWorkspace(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "omg-handoff-"));
  tmpRoots.push(d);
  return d;
}

afterEach(() => {
  for (const d of tmpRoots.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

function cfg(over: Partial<EnvConfig> = {}): EnvConfig {
  return {
    pluginRoot: ".",
    pluginData: ".",
    grokHome: ".",
    stateDirName: ".omg",
    skillGate: false,
    intentGate: false,
    planMode: false,
    hashline: false,
    diagEnforce: false,
    hardOrchestration: false,
    maxRalphIter: 10,
    todoCooldownMs: 0,
    todoAbortWindowMs: 0,
    diagCommand: "",
    diagTimeoutMs: 5000,
    hashlineTtlMs: 30 * 60 * 1000,
    commentChecker: false,
    commentCheckerDeny: false,
    agentGuard: false,
    ...over,
  };
}

function input(ws: string, over: Partial<HookInput> = {}): HookInput {
  return {
    raw: {},
    event: "user-prompt",
    sessionId: "handoff-sess",
    cwd: ws,
    workspaceRoot: ws,
    ...over,
  };
}

describe("detectHandoff", () => {
  it("detects '/handoff' as handoff intent", () => {
    expect(detectHandoff("/handoff")).toBe(true);
    expect(detectHandoff("/handoff fix the deploy")).toBe(true);
  });

  it("matches case-insensitively and tolerates leading whitespace", () => {
    expect(detectHandoff("  /HANDOFF")).toBe(true);
    expect(detectHandoff("\t/Handoff now")).toBe(true);
  });

  it("does not false-positive on lookalike prompts", () => {
    expect(detectHandoff("handoff me the file")).toBe(false);
    expect(detectHandoff("/handoffs list")).toBe(false);
    expect(detectHandoff("write a /handoff-style note")).toBe(false);
    expect(detectHandoff("")).toBe(false);
  });
});

describe("writeHandoffStub", () => {
  it("writes a stub containing PHASE 0–4 and session metadata", () => {
    const ws = tmpWorkspace();
    const c = cfg();
    const prompt = "/handoff ship the auth refactor";
    const file = writeHandoffStub(input(ws), c, prompt);

    expect(fs.existsSync(file)).toBe(true);
    const body = fs.readFileSync(file, "utf8");

    expect(body).toContain("## PHASE 0 — Context");
    expect(body).toContain("## PHASE 1 — Done");
    expect(body).toContain("## PHASE 2 — In progress");
    expect(body).toContain("## PHASE 3 — Next");
    expect(body).toContain("## PHASE 4 — Risks / open questions");
    expect(body).toContain(prompt);
    expect(body).toContain("handoff-sess");
    expect(body).toContain(ws);
  });

  it("lands inside the handoffs/ directory under the isolated state root", () => {
    const ws = tmpWorkspace();
    const c = cfg();
    const file = writeHandoffStub(input(ws), c, "/handoff");

    const expectedDir = path.join(ws, ".omg", "handoffs");
    expect(path.dirname(file)).toBe(expectedDir);
    expect(path.basename(file)).toMatch(/-handoff\.md$/);
    expect(fs.existsSync(expectedDir)).toBe(true);
  });

  it("uses a per-session-distinct sessionId when supplied", () => {
    const ws = tmpWorkspace();
    const c = cfg();
    const file = writeHandoffStub(
      input(ws, { sessionId: "sess-XYZ" }),
      c,
      "/handoff",
    );
    expect(fs.readFileSync(file, "utf8")).toContain("sessionId: sess-XYZ");
  });
});

describe("handoffContext", () => {
  it("returns non-empty additionalContext with the OMG_HANDOFF markers", () => {
    const ctx = handoffContext("/tmp/x/handoff.md");
    expect(ctx).toBeTruthy();
    expect(ctx).toContain("<OMG_HANDOFF>");
    expect(ctx).toContain("</OMG_HANDOFF>");
  });

  it("embeds the target file path and resume directive", () => {
    const file = "/state/.omg/handoffs/123-handoff.md";
    const ctx = handoffContext(file);
    expect(ctx).toContain(file);
    expect(ctx).toMatch(/PHASE 0.?4|PHASE 0.4/i);
    expect(ctx).toMatch(/resume|handoff/i);
  });
});

describe("handoffsDir isolation (no real .omg/ pollution)", () => {
  it("never writes outside the injected workspaceRoot tmp dir", () => {
    const ws = tmpWorkspace();
    const realProjectRoot = process.cwd();
    // If isolation broke, the stub would land under the real project .omg/.
    expect(ws).not.toBe(realProjectRoot);

    const file = writeHandoffStub(input(ws), cfg(), "/handoff");

    expect(file.startsWith(ws)).toBe(true);
    // Real project state dir must remain untouched.
    expect(fs.existsSync(path.join(realProjectRoot, ".omg", "handoffs"))).toBe(
      false,
    );
  });
});
