/**
 * orchestration.ts + session-end (MAGI v0.26).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { handleSessionEnd } from "../src/events/session-end.js";
import { handleUserPrompt } from "../src/events/user-prompt.js";
import type { EnvConfig, HookInput } from "../src/protocol/types.js";
import {
  commentCheckerHint,
  hardOrchestrationBanner,
} from "../src/features/orchestration.js";
import { readJson, writeJsonAtomic } from "../src/state/fs.js";
import { pathsFor } from "../src/state/paths.js";

const tmpRoots: string[] = [];

function tmpWorkspace(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "omg-orch-"));
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
    intentGate: false,
    planMode: false,
    hashline: false,
    diagEnforce: false,
    hardOrchestration: true,
    maxRalphIter: 10,
    todoCooldownMs: 5000,
    todoAbortWindowMs: 3000,
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
    event: "user-prompt",
    sessionId: "orch-sess",
    cwd: ws,
    workspaceRoot: ws,
    ...over,
  };
}

describe("hardOrchestrationBanner / commentCheckerHint", () => {
  it("banner covers classify/delegate/skill/hashline/verify/loops", () => {
    const b = hardOrchestrationBanner();
    expect(b).toMatch(/OMG_HARD_ORCHESTRATION/);
    expect(b).toMatch(/CLASSIFY|DELEGATE|SKILLS|Hashline|VERIFY|LOOPS/i);
    expect(b).toMatch(/explore|oracle|hephaestus/i);
  });

  it("comment hint forbids restating slop", () => {
    const h = commentCheckerHint();
    expect(h).toMatch(/OMG_COMMENT_CHECKER/);
    expect(h).toMatch(/This function|slop|non-obvious/i);
  });
});

describe("UserPrompt hard orchestration injection", () => {
  it("hardOrchestration true → inject banner", () => {
    const ws = tmpWorkspace();
    const out = handleUserPrompt(
      base(ws, { prompt: "do a multi-step feature" }),
      cfg(path.join(ws, "pdata"), { hardOrchestration: true }),
    );
    expect("additionalContext" in out && out.additionalContext).toMatch(
      /HARD_ORCHESTRATION/,
    );
  });

  it("hardOrchestration false → no banner", () => {
    const ws = tmpWorkspace();
    const out = handleUserPrompt(
      base(ws, { prompt: "do a multi-step feature" }),
      cfg(path.join(ws, "pdata"), { hardOrchestration: false }),
    );
    const ctx =
      "additionalContext" in out ? String(out.additionalContext || "") : "";
    expect(ctx).not.toMatch(/OMG_HARD_ORCHESTRATION/);
  });
});

describe("handleSessionEnd", () => {
  it("resets prompt count; does not throw", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data);
    const input = base(ws, { event: "session-end" });
    const p = pathsFor(ws, "orch-sess", c);
    fs.mkdirSync(path.dirname(p.promptCount), { recursive: true });
    writeJsonAtomic(p.promptCount, { n: 7 });
    const out = handleSessionEnd(input, c);
    expect(out).toEqual({});
    expect(readJson<{ n: number }>(p.promptCount, { n: -1 }).n).toBe(0);
  });
});
