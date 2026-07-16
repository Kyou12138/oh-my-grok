/**
 * pre-tool-use 门禁编排顺序锁定 (MAGI 螺旋 7, v0.14, 组 G3a)
 *
 * 直驱 handlePreToolUse 纯函数,锁定门禁短路顺序:
 *   0 agent-guard → mutating 短路 → 1 plan-mode → 1.5 category-discipline
 *   → 2 hashline → 3 comment-checker → 4 skill-gate
 *
 * 双重断言:命中先置门禁时 reason 含先置门禁文案 且 不含后置门禁文案。
 * 关键防回归:agent-guard 对非 mutating 工具 return null,故 oracle 的 Read 直接 allow(非被拦)。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { handlePreToolUse } from "../src/events/pre-tool-use.js";
import { recordRead } from "../src/features/hashline.js";
import { startPlanMode } from "../src/features/prometheus.js";
import type { EnvConfig, HookInput } from "../src/protocol/types.js";

// 复用 functional-gates.test.ts 的真实 root 计算 —— skill catalog 必须非空
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

// 对齐 types.ts:65 — categoryDiscipline 必填
function cfg(pluginData: string, over: Partial<EnvConfig> = {}): EnvConfig {
  return {
    pluginRoot: root,
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
    diagCommand: "",
    diagTimeoutMs: 5000,
    hashlineTtlMs: 30 * 60 * 1000,
    commentChecker: true,
    commentCheckerDeny: false,
    agentGuard: true,
    categoryDiscipline: true,
    ...over,
  };
}

function base(ws: string, over: Partial<HookInput> = {}): HookInput {
  return {
    raw: {},
    event: "pre-tool-use",
    sessionId: "orch-sess",
    cwd: ws,
    workspaceRoot: ws,
    ...over,
  };
}

describe("pre-tool-use orchestration — 门禁顺序锁定", () => {
  // ===== 顺序锁定 (双重断言) =====

  it("1. agent-guard 拦截 oracle 的 Write 早于 hashline", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    // 已存在的 src 文件 —— 若顺序错乱,hashline 也会在此拦
    const file = path.join(ws, "src", "app.ts");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "export const a = 1;\n", "utf8");
    const c = cfg(data, { agentGuard: true, hashline: true });
    const r = handlePreToolUse(
      base(ws, {
        toolName: "Write",
        agentName: "oracle",
        toolInput: { path: file, contents: "export const a = 2;\n" },
      }),
      c,
    );
    expect(r.exitCode).toBe(2);
    const json = JSON.stringify(r.output);
    expect(json).toMatch(/AGENT_GUARD|read-only|oracle/i);
    expect(json).not.toMatch(/Hashline/i);
  });

  it("2. plan-mode 拦截 src/ 写入早于 hashline", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const file = path.join(ws, "src", "app.ts");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "export const a = 1;\n", "utf8");
    const c = cfg(data, { agentGuard: false, planMode: true, hashline: true });
    // 直接激活 plan-mode (写 .omg/plan-mode.json state)
    startPlanMode(base(ws), c, "oauth 重构");
    const r = handlePreToolUse(
      base(ws, {
        toolName: "Write",
        toolInput: { path: file, contents: "export const a = 2;\n" },
      }),
      c,
    );
    expect(r.exitCode).toBe(2);
    const json = JSON.stringify(r.output);
    expect(json).toMatch(/plan-mode|Prometheus/i);
    expect(json).not.toMatch(/Hashline/i);
  });

  it("3. hashline 拦截无 Read 的 StrReplace 早于 comment-checker", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const file = path.join(ws, "src", "app.ts");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "export const a = 1;\n", "utf8");
    // 无 Read 缓存 + slop 内容 —— 若顺序错乱,comment-checker 先命中
    const c = cfg(data, {
      agentGuard: false,
      hashline: true,
      commentChecker: true,
      commentCheckerDeny: true,
    });
    const r = handlePreToolUse(
      base(ws, {
        toolName: "StrReplace",
        toolInput: {
          path: file,
          old_string: "export const a = 1;",
          new_string: "// This function calculates the value\nexport const a = 2;",
        },
      }),
      c,
    );
    expect(r.exitCode).toBe(2);
    const json = JSON.stringify(r.output);
    expect(json).toMatch(/Hashline|Read/i);
    expect(json).not.toMatch(/COMMENT_CHECKER|slop/i);
  });

  it("4. comment-checker 拦截 slop 早于 skill-gate", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const file = path.join(ws, "slop.ts");
    fs.writeFileSync(file, "export const a = 1;\n", "utf8");
    // recordRead 预建缓存绕过 hashline (existing file + fresh cache → pass)
    const c = cfg(data, {
      agentGuard: false,
      hashline: true,
      commentChecker: true,
      commentCheckerDeny: true,
      skillGate: true,
    });
    recordRead(base(ws), c, file);
    const r = handlePreToolUse(
      base(ws, {
        toolName: "Write",
        toolInput: {
          path: file,
          contents: "// This function calculates the total\nexport const a = 2;\n",
        },
      }),
      c,
    );
    expect(r.exitCode).toBe(2);
    const json = JSON.stringify(r.output);
    expect(json).toMatch(/COMMENT_CHECKER|slop/i);
    expect(json).not.toMatch(/Skill Gate/i);
  });

  it("5. skill-gate 作为最后兜底门禁", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const file = path.join(ws, "clean.ts");
    fs.writeFileSync(file, "export const a = 1;\n", "utf8");
    // 前四道放行:agentGuard 关、无 plan-mode、recordRead 绕 hashline、内容干净
    const c = cfg(data, {
      agentGuard: false,
      planMode: true,
      hashline: true,
      commentChecker: true,
      commentCheckerDeny: true,
      skillGate: true,
    });
    recordRead(base(ws), c, file);
    const r = handlePreToolUse(
      base(ws, {
        toolName: "Write",
        toolInput: {
          path: file,
          // 非注释复述型 —— 不触发 comment-checker;文件名无 intent 关键词
          contents: "export const a = 2;\n",
        },
      }),
      c,
    );
    expect(r.exitCode).toBe(2);
    const json = JSON.stringify(r.output);
    expect(json).toMatch(/Skill Gate/i);
  });

  // ===== 非 mutating 短路 (防 oracle 读漏网) =====

  it("6. Read 工具直接放行,跳过所有门禁 (agent-guard 对非 mutating 返回 null)", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data, { skillGate: true, agentGuard: true });
    const r = handlePreToolUse(
      base(ws, {
        toolName: "Read",
        agentName: "oracle",
        toolInput: { path: path.join(ws, "anything.ts") },
      }),
      c,
    );
    expect(r.exitCode).toBe(0);
    expect(r.output).toMatchObject({ decision: "allow" });
  });

  it("7. Glob/Grep 等非 mutating 工具直接放行", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data, { skillGate: true, agentGuard: true });
    const r = handlePreToolUse(
      base(ws, {
        toolName: "Glob",
        agentName: "oracle",
        toolInput: { pattern: "**/*.ts" },
      }),
      c,
    );
    expect(r.exitCode).toBe(0);
    expect(r.output).toMatchObject({ decision: "allow" });
  });

  // ===== fail-open =====

  it("8. agentGuard:false 时 oracle 的 Write 不被拦截", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data, {
      agentGuard: false,
      planMode: false,
      hashline: false,
      commentCheckerDeny: false,
      skillGate: false,
    });
    const r = handlePreToolUse(
      base(ws, {
        toolName: "Write",
        agentName: "oracle",
        toolInput: { path: path.join(ws, "x.ts"), contents: "export {}\n" },
      }),
      c,
    );
    expect(r.exitCode).toBe(0);
  });

  it("9. skillGate:false 时 catalog 非空也跳过 skill-gate", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const file = path.join(ws, "exist.ts");
    fs.writeFileSync(file, "export const n = 1;\n", "utf8");
    const c = cfg(data, {
      agentGuard: false,
      planMode: false,
      hashline: true,
      commentCheckerDeny: false,
      skillGate: false,
    });
    // recordRead 让 hashline 放行;skill-gate 整段被 cfg.skillGate=false 跳过
    recordRead(base(ws), c, file);
    const r = handlePreToolUse(
      base(ws, {
        toolName: "Write",
        toolInput: { path: file, contents: "export const n = 2;\n" },
      }),
      c,
    );
    expect(r.exitCode).toBe(0);
  });

  it("10. planMode:false 时即使 plan 激活也不拦截 src/ 写入", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const file = path.join(ws, "src", "app.ts");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "export const a = 1;\n", "utf8");
    const c = cfg(data, {
      agentGuard: false,
      planMode: false,
      hashline: false,
      commentCheckerDeny: false,
      skillGate: false,
    });
    // 激活 plan-mode state,但 cfg.planMode=false → planModeDeny 立即 return null
    startPlanMode(base(ws), c, "should-not-block");
    const r = handlePreToolUse(
      base(ws, {
        toolName: "Write",
        toolInput: { path: file, contents: "export const a = 2;\n" },
      }),
      c,
    );
    expect(r.exitCode).toBe(0);
  });

  // ===== 文案锁定 =====

  it("11. 全门禁放行返回 allow 且无 reason", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    // 写入全新文件 (不存在) → hashline 无 current 直接放行
    const c = cfg(data, {
      agentGuard: false,
      planMode: false,
      hashline: true,
      commentChecker: true,
      commentCheckerDeny: true,
      skillGate: false,
    });
    const r = handlePreToolUse(
      base(ws, {
        toolName: "Write",
        toolInput: {
          path: path.join(ws, "newfile.ts"),
          contents: "export const clean = 1;\n",
        },
      }),
      c,
    );
    expect(r.exitCode).toBe(0);
    expect(r.output).toMatchObject({ decision: "allow" });
    // allow 分支不应携带 reason 字段
    expect("reason" in r.output).toBe(false);
  });
});
