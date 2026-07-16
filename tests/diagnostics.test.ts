/**
 * diagnostics feature suite — pure-function + state coverage for
 * src/features/diagnostics.ts.
 *
 * 覆盖:
 * 1. isVerifiedMessage 真值表(含负向用例,锁 verify-gate 不被
 *    'not all tests passed' 误放行 —— v0.13 bug 修复)。
 * 2. diagStopReason 三分支(lastErrors 硬阻断 / needsVerify 软提醒 /
 *    diagCommand 已配无 lastErrors 返回 null)。
 * 3. runDiagCommand 状态分支(status===0 清错 / status!==0 记错)。
 *
 * state isolation: 每个 it 在 os.tmpdir() 下建唯一子目录作为
 * workspaceRoot,HookInput.workspaceRoot 指向它;it 结束递归清理。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  diagPreDeny,
  diagStopReason,
  isVerifiedMessage,
  markDirty,
  runDiagCommand,
} from "../src/features/diagnostics.js";
import { handlePreToolUse } from "../src/events/pre-tool-use.js";
import type { EnvConfig, HookInput } from "../src/protocol/types.js";

const tmpRoots: string[] = [];

afterEach(() => {
  for (const d of tmpRoots.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

function tmpWorkspace(prefix = "omg-diag-"): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpRoots.push(d);
  return d;
}

function makeCfg(overrides: Partial<EnvConfig> = {}): EnvConfig {
  return {
    pluginRoot: os.tmpdir(),
    pluginData: os.tmpdir(),
    grokHome: "",
    stateDirName: ".omg",
    skillGate: true,
    intentGate: true,
    planMode: true,
    hashline: true,
    diagEnforce: true,
    hardOrchestration: true,
    maxRalphIter: 50,
    todoCooldownMs: 5000,
    todoAbortWindowMs: 3000,
    diagCommand: "",
    diagTimeoutMs: 60000,
    hashlineTtlMs: 60 * 60 * 1000,
    commentChecker: true,
    commentCheckerDeny: false,
    agentGuard: true,
    categoryDiscipline: true,
    ...overrides,
  };
}

function makeInput(ws: string, overrides: Partial<HookInput> = {}): HookInput {
  return {
    raw: {},
    event: "stop",
    sessionId: `diag-${path.basename(ws)}`,
    cwd: ws,
    workspaceRoot: ws,
    ...overrides,
  };
}

describe("diagnostics — isVerifiedMessage 真值表", () => {
  it("正例:精确标记 <promise>VERIFIED</promise> 返回 true", () => {
    expect(isVerifiedMessage("<promise>VERIFIED</promise>")).toBe(true);
  });
  it("正例:精确标记 OMG_VERIFIED 返回 true", () => {
    expect(isVerifiedMessage("OMG_VERIFIED")).toBe(true);
  });
  it("正例:精确标记 diagnostics clean 返回 true", () => {
    expect(isVerifiedMessage("diagnostics clean")).toBe(true);
  });
  it("正例:肯定陈述 'all tests passed' 返回 true", () => {
    expect(isVerifiedMessage("all tests passed")).toBe(true);
    expect(isVerifiedMessage("All tests passed.")).toBe(true);
    expect(isVerifiedMessage("✓ all tests passed")).toBe(true);
  });
  it("负例:空消息返回 false", () => {
    expect(isVerifiedMessage(undefined)).toBe(false);
    expect(isVerifiedMessage("")).toBe(false);
    expect(isVerifiedMessage("still working on it")).toBe(false);
  });
  it("负例:'not all tests passed' 不得误判已验证(v0.13 verify-gate bug 修复)", () => {
    expect(isVerifiedMessage("not all tests passed")).toBe(false);
    expect(isVerifiedMessage("Not all tests passed.")).toBe(false);
  });
  it("负例:否定句中的 'all tests passed' 不得误放行", () => {
    expect(isVerifiedMessage("I have not confirmed all tests passed")).toBe(false);
    expect(isVerifiedMessage("not all tests passed yet")).toBe(false);
  });
  it("负例:缩写否定 don't/doesn't/isn't/…n't + all tests passed 不得误放行(v0.14 续修)", () => {
    for (const w of [
      "don't", "doesn't", "isn't", "aren't", "wasn't", "weren't",
      "won't", "wouldn't", "shouldn't", "couldn't", "mustn't",
      "haven't", "hasn't", "hadn't", "ain't", "didn't",
    ]) {
      expect(isVerifiedMessage(`${w} all tests passed`)).toBe(false);
    }
  });
  it("负例:频度否定 rarely/seldom/hardly/barely/scarcely + all tests passed 不得误放行", () => {
    for (const w of ["rarely", "seldom", "hardly", "barely", "scarcely"]) {
      expect(isVerifiedMessage(`${w} all tests passed`)).toBe(false);
    }
  });
  it("负例:非缩写 'do not'/'does not'/'is not' + all tests passed 不得误放行", () => {
    expect(isVerifiedMessage("do not all tests passed")).toBe(false);
    expect(isVerifiedMessage("does not all tests passed")).toBe(false);
    expect(isVerifiedMessage("is not all tests passed")).toBe(false);
  });
});

describe("diagnostics — diagStopReason 三分支", () => {
  it("lastErrors 非空 → 硬阻断 reason(含 DIAGNOSTICS BLOCK)", () => {
    const ws = tmpWorkspace();
    const cfg = makeCfg({ diagCommand: `node -e "process.exit(1)"` });
    const input = makeInput(ws);
    markDirty(input, cfg, "src/a.ts");
    runDiagCommand(input, cfg);
    const reason = diagStopReason(input, cfg);
    expect(reason).not.toBeNull();
    expect(reason).toMatch(/DIAGNOSTICS BLOCK/);
  });

  it("needsVerify + 无 diagCommand + 未 softPrompted → 软提醒(含 VERIFY BEFORE STOP)", () => {
    const ws = tmpWorkspace();
    const cfg = makeCfg({ diagCommand: "" });
    const input = makeInput(ws);
    markDirty(input, cfg, "src/a.ts");
    const reason = diagStopReason(input, cfg);
    expect(reason).not.toBeNull();
    expect(reason).toMatch(/VERIFY BEFORE STOP/);
  });

  it("diagCommand 已配 + needsVerify + 无 lastErrors → 返回 null(等 post-write 重跑)", () => {
    const ws = tmpWorkspace();
    const cfg = makeCfg({ diagCommand: "node -e process.exit(0)" });
    const input = makeInput(ws);
    markDirty(input, cfg, "src/a.ts");
    const reason = diagStopReason(input, cfg);
    expect(reason).toBeNull();
  });
});

describe("diagnostics — runDiagCommand 状态分支", () => {
  it("status===0 → needsVerify=false, lastErrors 清空", () => {
    const ws = tmpWorkspace();
    const cfg = makeCfg({ diagCommand: `node -e "process.exit(0)"` });
    const input = makeInput(ws);
    markDirty(input, cfg, "src/a.ts");
    const st = runDiagCommand(input, cfg);
    expect(st.needsVerify).toBe(false);
    expect(st.lastErrors).toBe("");
    expect(st.verifiedAt).toBeGreaterThan(0);
  });

  it("status!==0 → needsVerify=true, lastErrors 非空", () => {
    const ws = tmpWorkspace();
    const cfg = makeCfg({ diagCommand: `node -e "process.exit(1)"` });
    const input = makeInput(ws);
    const st = runDiagCommand(input, cfg);
    expect(st.needsVerify).toBe(true);
    expect(st.lastErrors.length).toBeGreaterThan(0);
  });
});

describe("diagnostics — diagPreDeny (v1.1.5 host-enforced)", () => {
  it("lastErrors → PreTool deny; clean run → allow", () => {
    const ws = tmpWorkspace();
    const cfg = makeCfg({
      diagCommand: `node -e "process.exit(1)"`,
      skillGate: false,
      hashline: false,
      planMode: false,
      agentGuard: false,
      categoryDiscipline: false,
    });
    const input = makeInput(ws);
    markDirty(input, cfg, "src/a.ts");
    runDiagCommand(input, cfg);
    expect(diagPreDeny(input, cfg)).toMatch(/DIAGNOSTICS|failed/i);

    const write = {
      ...input,
      event: "pre-tool-use" as const,
      toolName: "Write",
      toolInput: { path: path.join(ws, "b.ts"), contents: "export {}\n" },
    };
    const r = handlePreToolUse(write, cfg);
    expect(r.exitCode).toBe(2);

    // green diag clears hard block
    const cfgOk = makeCfg({
      ...cfg,
      diagCommand: `node -e "process.exit(0)"`,
    });
    runDiagCommand(input, cfgOk);
    expect(diagPreDeny(input, cfgOk)).toBeNull();
    expect(handlePreToolUse(write, cfgOk).exitCode).toBe(0);
  });

  it("soft needsVerify without lastErrors → PreTool null", () => {
    const ws = tmpWorkspace();
    const cfg = makeCfg({ diagCommand: "" });
    const input = makeInput(ws);
    markDirty(input, cfg, "src/a.ts");
    expect(diagPreDeny(input, cfg)).toBeNull();
  });
});
