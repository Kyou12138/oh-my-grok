/**
 * hashline feature suite — pure-function coverage for
 * src/features/hashline.ts.
 *
 * testability: hashline.ts 导出 recordRead / getCached / hashlinePreToolDeny
 * 等纯函数;这里直接驱动它们,不拉起 dist/cli.js 全链路。
 *
 * state isolation: 每个 it 在 os.tmpdir() 下建唯一子目录作为
 * workspaceRoot,HookInput.workspaceRoot 指向它;it 结束递归清理。
 * 全程真实 fs,不 mock。
 *
 * 覆盖三条零覆盖分支:
 * 1. 跨风格路径收敛 —— './a.ts' / 'a.ts' / path.join 拼出的平台分隔符形式,
 *    recordRead 后 getCached 对任一形式都命中同一缓存条目。
 * 2. stale-cache 拒绝 —— recordRead 读后改文件内容,strreplace/edit 应被
 *    hashlinePreToolDeny 以 "changed since last Read (stale)" 非空 reason 拒绝。
 * 3. post-write recache 链路 —— recordRead → 改 → 再 recordRead(模拟 Write 后
 *    刷新) → getCached 返回新 hash;新内容 strreplace allow,旧内容 deny。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getCached,
  hashlinePreToolDeny,
  recordRead,
} from "../src/features/hashline.js";
import type { EnvConfig, HookInput } from "../src/protocol/types.js";

/** 本轮用到的临时目录,afterEach 统一清理。 */
const tmpRoots: string[] = [];

afterEach(() => {
  for (const d of tmpRoots.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

/** 建一个唯一临时目录并登记,返回绝对路径。 */
function tmpWorkspace(prefix = "omg-hashline-"): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpRoots.push(d);
  return d;
}

/**
 * 构造最小可用的 EnvConfig,参照 src/features/config.ts 的默认值。
 * hashlineTtlMs 给一个足够大的值(1h)避免 TTL 干扰断言。
 */
function makeCfg(): EnvConfig {
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
    hashlineTtlMs: 60 * 60 * 1000, // 1h,远大于测试运行时间
    commentChecker: true,
    commentCheckerDeny: false,
    agentGuard: true,
    categoryDiscipline: true,
  };
}

/** 构造一个指向 ws 的 HookInput,toolName/toolInput 由调用方覆盖。 */
function makeInput(
  ws: string,
  overrides: Pick<HookInput, "toolName" | "toolInput">,
): HookInput {
  return {
    raw: {},
    event: "pre-tool-use",
    sessionId: `test-${path.basename(ws)}`,
    cwd: ws,
    workspaceRoot: ws,
    ...overrides,
  };
}

/** 同步等待,确保 mtime 至少向前推进(部分文件系统 mtime 精度为秒)。 */
function bumpMtime(): void {
  // 写一次再等待 50ms;若 mtime 精度不够,contentHash 变化也会触发 stale。
  const start = Date.now();
  while (Date.now() - start < 50) {
    /* spin */
  }
}

describe("hashline — 跨风格路径收敛", () => {
  it("同一物理文件用 './a.ts' / 'a.ts' / path.join 平台分隔符形式 recordRead 后,getCached 对任一形式都命中同一缓存条目", () => {
    const ws = tmpWorkspace();
    const fileAbs = path.join(ws, "a.ts");
    fs.writeFileSync(fileAbs, "const x = 1;\n", "utf8");
    const cfg = makeCfg();

    // Read('./a.ts') 建缓存
    const readInput = makeInput(ws, {
      toolName: "Read",
      toolInput: { file_path: "./a.ts" },
    });
    const entry = recordRead(readInput, cfg, "./a.ts");
    expect(entry).not.toBeNull();
    const firstHash = entry!.contentHash;

    // 三种形式都应命中同一缓存条目(hash 一致即同一物理条目)
    const lookupInput = makeInput(ws, {
      toolName: "Edit",
      toolInput: { file_path: "placeholder" },
    });

    // 1) 裸相对名 'a.ts'
    const viaBare = getCached(lookupInput, cfg, "a.ts");
    expect(viaBare).toBeDefined();
    expect(viaBare!.contentHash).toBe(firstHash);

    // 2) './a.ts' 显式 dot-slash
    const viaDot = getCached(lookupInput, cfg, "./a.ts");
    expect(viaDot).toBeDefined();
    expect(viaDot!.contentHash).toBe(firstHash);

    // 3) path.join 拼出的含平台分隔符的形式(绝对路径)
    const viaJoin = getCached(lookupInput, cfg, path.join(ws, "a.ts"));
    expect(viaJoin).toBeDefined();
    expect(viaJoin!.contentHash).toBe(firstHash);

    // 三者 path 字段应指向同一物理文件,证明收敛到同一缓存条目
    expect(viaBare!.path).toBe(fileAbs);
    expect(viaDot!.path).toBe(fileAbs);
    expect(viaJoin!.path).toBe(fileAbs);
  });
});

describe("hashline — stale-cache 拒绝", () => {
  it("recordRead 读后改文件内容,strreplace 的 hashlinePreToolDeny 返回非空 reason(含 stale / changed since last Read)", () => {
    const ws = tmpWorkspace();
    const fileAbs = path.join(ws, "src.ts");
    fs.mkdirSync(path.dirname(fileAbs), { recursive: true });
    fs.writeFileSync(fileAbs, "const ORIGINAL = 1;\n", "utf8");
    const cfg = makeCfg();

    // 先 Read 建缓存
    recordRead(
      makeInput(ws, { toolName: "Read", toolInput: { file_path: "src.ts" } }),
      cfg,
      "src.ts",
    );

    // 改文件内容(改变 contentHash;mtime 也尽力推进)
    bumpMtime();
    fs.writeFileSync(fileAbs, "const CHANGED = 999;\n", "utf8");

    // strreplace 用旧 old_string 应因 stale cache 被拒
    const deny = hashlinePreToolDeny(
      makeInput(ws, {
        toolName: "strreplace",
        toolInput: {
          file_path: "src.ts",
          old_string: "const ORIGINAL = 1;",
          new_string: "const ORIGINAL = 2;",
        },
      }),
      cfg,
    );

    expect(deny).not.toBeNull();
    // reason 应明示 stale / changed since last Read
    expect(deny).toMatch(/stale|changed since last Read/i);
  });
});

describe("hashline — post-write recache 链路", () => {
  it("recordRead → 改 → 再 recordRead 后 getCached 返回新 hash;新内容 strreplace allow,旧内容 deny", () => {
    const ws = tmpWorkspace();
    const fileAbs = path.join(ws, "mod.ts");
    fs.writeFileSync(fileAbs, "const OLD = 1;\n", "utf8");
    const cfg = makeCfg();

    // 第一次 Read:缓存 OLD 内容
    recordRead(
      makeInput(ws, { toolName: "Read", toolInput: { file_path: "mod.ts" } }),
      cfg,
      "mod.ts",
    );
    const cachedOld = getCached(
      makeInput(ws, { toolName: "Edit", toolInput: { file_path: "mod.ts" } }),
      cfg,
      "mod.ts",
    );
    expect(cachedOld).toBeDefined();
    const oldHash = cachedOld!.contentHash;

    // 改文件内容,模拟外部 Write
    bumpMtime();
    fs.writeFileSync(fileAbs, "const NEW = 2;\n", "utf8");

    // 再次 recordRead —— 模拟 post-tool Write 后刷新缓存(见 post-tool.ts handlePostToolWrite)
    recordRead(
      makeInput(ws, { toolName: "Read", toolInput: { file_path: "mod.ts" } }),
      cfg,
      "mod.ts",
    );
    const cachedNew = getCached(
      makeInput(ws, { toolName: "Edit", toolInput: { file_path: "mod.ts" } }),
      cfg,
      "mod.ts",
    );
    expect(cachedNew).toBeDefined();
    // 新内容 hash 必须与旧的不同(证明 recache 生效)
    expect(cachedNew!.contentHash).not.toBe(oldHash);

    // 对【新内容】的 strreplace old_string 应 allow(返回 null)
    const allowNew = hashlinePreToolDeny(
      makeInput(ws, {
        toolName: "strreplace",
        toolInput: {
          file_path: "mod.ts",
          old_string: "const NEW = 2;",
          new_string: "const NEW = 3;",
        },
      }),
      cfg,
    );
    expect(allowNew).toBeNull();

    // 对【旧内容】的 strreplace old_string 应 deny(返回非 null)
    const denyOld = hashlinePreToolDeny(
      makeInput(ws, {
        toolName: "strreplace",
        toolInput: {
          file_path: "mod.ts",
          old_string: "const OLD = 1;",
          new_string: "const OLD = 2;",
        },
      }),
      cfg,
    );
    expect(denyOld).not.toBeNull();
  });
});
