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
  stripHashlinePrefixes,
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
    todoMaxContinues: 20,
    todoMaxStagnation: 3,
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

describe("hashline — SearchReplace isReplace branch (v1.1.6)", () => {
  it("SearchReplace with stale old_string is denied (was skipped before letter-norm)", () => {
    const ws = tmpWorkspace();
    const fileAbs = path.join(ws, "app.ts");
    fs.writeFileSync(fileAbs, "export const n = 1;\n", "utf8");
    const cfg = makeCfg();
    recordRead(
      makeInput(ws, { toolName: "Read", toolInput: { file_path: "app.ts" } }),
      cfg,
      "app.ts",
    );
    // Wrong old_string — must hit isReplace + not-found (SearchReplace CamelCase)
    const deny = hashlinePreToolDeny(
      makeInput(ws, {
        toolName: "SearchReplace",
        toolInput: {
          file_path: "app.ts",
          old_string: "export const n = 999;",
          new_string: "export const n = 2;",
        },
      }),
      cfg,
    );
    expect(deny).not.toBeNull();
    expect(deny).toMatch(/old_string not found|stale/i);
  });

  it("search-replace with correct old_string allows", () => {
    const ws = tmpWorkspace();
    const fileAbs = path.join(ws, "ok.ts");
    fs.writeFileSync(fileAbs, "export const ok = true;\n", "utf8");
    const cfg = makeCfg();
    recordRead(
      makeInput(ws, { toolName: "Read", toolInput: { file_path: "ok.ts" } }),
      cfg,
      "ok.ts",
    );
    const deny = hashlinePreToolDeny(
      makeInput(ws, {
        toolName: "search-replace",
        toolInput: {
          file_path: "ok.ts",
          old_string: "export const ok = true;",
          new_string: "export const ok = false;",
        },
      }),
      cfg,
    );
    expect(deny).toBeNull();
  });
});

describe("hashline — Grok read_file N→ prefix strip (v1.1.10)", () => {
  it("stripHashlinePrefixes removes Grok LINE_NUMBER→ and LINE#TAG|", () => {
    expect(stripHashlinePrefixes("1→hello\n2→world")).toBe("hello\nworld");
    expect(stripHashlinePrefixes("3#AB| body")).toBe("body");
    expect(stripHashlinePrefixes("plain")).toBe("plain");
  });

  it("search_replace allows old_string pasted from Grok read_file output", () => {
    const ws = tmpWorkspace();
    const fileAbs = path.join(ws, "main.ts");
    fs.writeFileSync(fileAbs, "export function main() {\n  return 1;\n}\n", "utf8");
    const cfg = makeCfg();
    recordRead(
      makeInput(ws, { toolName: "read_file", toolInput: { file_path: "main.ts" } }),
      cfg,
      "main.ts",
    );
    // Agent pasted tool output including N→ prefixes (common mistake)
    const deny = hashlinePreToolDeny(
      makeInput(ws, {
        toolName: "search_replace",
        toolInput: {
          file_path: "main.ts",
          old_string: "1→export function main() {\n2→  return 1;\n3→}",
          new_string: "export function main() {\n  return 2;\n}",
        },
      }),
      cfg,
    );
    expect(deny).toBeNull();
  });

  it("still denies when body after stripping does not match disk", () => {
    const ws = tmpWorkspace();
    fs.writeFileSync(path.join(ws, "x.ts"), "const a = 1;\n", "utf8");
    const cfg = makeCfg();
    recordRead(
      makeInput(ws, { toolName: "read_file", toolInput: { file_path: "x.ts" } }),
      cfg,
      "x.ts",
    );
    const deny = hashlinePreToolDeny(
      makeInput(ws, {
        toolName: "search_replace",
        toolInput: {
          file_path: "x.ts",
          old_string: "1→const a = 999;",
          new_string: "const a = 2;",
        },
      }),
      cfg,
    );
    expect(deny).toMatch(/old_string not found/i);
  });
});

describe("hashline — empty Write wipe (v1.1.15)", () => {
  it("denies Write with empty contents on existing file", () => {
    const ws = tmpWorkspace();
    fs.writeFileSync(path.join(ws, "wipe.ts"), "keep me\n", "utf8");
    const cfg = makeCfg();
    recordRead(
      makeInput(ws, { toolName: "Read", toolInput: { file_path: "wipe.ts" } }),
      cfg,
      "wipe.ts",
    );
    const deny = hashlinePreToolDeny(
      makeInput(ws, {
        toolName: "Write",
        toolInput: { file_path: "wipe.ts", contents: "" },
      }),
      cfg,
    );
    expect(deny).toMatch(/Empty Write|wipe/i);
  });

  it("allows Write with content on existing file after Read", () => {
    const ws = tmpWorkspace();
    fs.writeFileSync(path.join(ws, "ok.ts"), "old\n", "utf8");
    const cfg = makeCfg();
    recordRead(
      makeInput(ws, { toolName: "Read", toolInput: { file_path: "ok.ts" } }),
      cfg,
      "ok.ts",
    );
    expect(
      hashlinePreToolDeny(
        makeInput(ws, {
          toolName: "Write",
          toolInput: { file_path: "ok.ts", contents: "new\n" },
        }),
        cfg,
      ),
    ).toBeNull();
  });
});

describe("hashline — empty old_string on existing file (v1.1.13)", () => {
  it("denies empty old_string when file exists", () => {
    const ws = tmpWorkspace();
    fs.writeFileSync(path.join(ws, "exist.ts"), "const x = 1;\n", "utf8");
    const cfg = makeCfg();
    recordRead(
      makeInput(ws, { toolName: "Read", toolInput: { file_path: "exist.ts" } }),
      cfg,
      "exist.ts",
    );
    const deny = hashlinePreToolDeny(
      makeInput(ws, {
        toolName: "search_replace",
        toolInput: {
          file_path: "exist.ts",
          old_string: "",
          new_string: "const x = 2;\n",
        },
      }),
      cfg,
    );
    expect(deny).toMatch(/Empty old_string|already exists/i);
  });

  it("allows empty old_string for brand-new file path", () => {
    const ws = tmpWorkspace();
    const cfg = makeCfg();
    // no file on disk, no cache required for create-via-empty-old_string
    const deny = hashlinePreToolDeny(
      makeInput(ws, {
        toolName: "search_replace",
        toolInput: {
          file_path: "brand-new.ts",
          old_string: "",
          new_string: "export const n = 1;\n",
        },
      }),
      cfg,
    );
    expect(deny).toBeNull();
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

/**
 * LINE#ID 校验分支专属覆盖(螺旋6 v0.13 组B)。
 *
 * hashlinePreToolDeny 的 isReplace 分支里有 4 个 LINE#ID 拒绝点
 * (anchors-without-cache / unknown-line / mismatch / body-mismatch),
 * 外加 TTL 过期与 empty old_string 放行。本组全部直驱纯函数、真实
 * 临时目录隔离,每个 it 用独立 tmpWorkspace;断言锁定每条 reason 的
 * 精确文案,纠正 functional-gates.test.ts 间接覆盖时过宽的匹配。
 */
describe("hashline — LINE#ID 校验分支", () => {
  it("(A) unknown line —— old_string 引用超出 lineCount 的行号,reason 含 unknown line / not in cache(锁 L241-247)", () => {
    const ws = tmpWorkspace();
    const fileAbs = path.join(ws, "two.ts");
    // 2 行文件,lineTags 有效下标 1..2
    fs.writeFileSync(fileAbs, "alpha\nbravo\n", "utf8");
    const cfg = makeCfg();

    recordRead(
      makeInput(ws, { toolName: "Read", toolInput: { file_path: "two.ts" } }),
      cfg,
      "two.ts",
    );

    // 999#AA 引用超出 lineCount 的行号 → expected = lineTags[999] = undefined
    const deny = hashlinePreToolDeny(
      makeInput(ws, {
        toolName: "strreplace",
        toolInput: {
          file_path: "two.ts",
          old_string: "999#AA| whatever",
          new_string: "x",
        },
      }),
      cfg,
    );

    // 锁定 unknown line 分支(不是 mismatch / body)
    expect(deny).not.toBeNull();
    expect(deny).toMatch(/unknown line number/i);
    expect(deny).toMatch(/not in cache/i);
    // 明确不能误命中其它 LINE#ID 分支
    expect(deny).not.toMatch(/mismatch/i);
    expect(deny).not.toMatch(/body/i);
  });

  it("(B) mismatch —— tag 故意写错,reason 含 LINE#ID mismatch / expected / got(锁 L248-254)", () => {
    const ws = tmpWorkspace();
    const fileAbs = path.join(ws, "m.ts");
    fs.writeFileSync(fileAbs, "const X = 1;\n", "utf8");
    const cfg = makeCfg();

    const entry = recordRead(
      makeInput(ws, { toolName: "Read", toolInput: { file_path: "m.ts" } }),
      cfg,
      "m.ts",
    );
    expect(entry).not.toBeNull();
    // 真实 tag(lineTags[1]);下面故意写一个不同的 tag
    const realTag = entry!.lineTags[1];
    const wrongTag = realTag === "ZZ" ? "AA" : "ZZ";

    const deny = hashlinePreToolDeny(
      makeInput(ws, {
        toolName: "strreplace",
        toolInput: {
          file_path: "m.ts",
          old_string: `1#${wrongTag}| const X = 1;`,
          new_string: "y",
        },
      }),
      cfg,
    );

    // 锁定 mismatch 分支(不是 unknown / body)
    expect(deny).not.toBeNull();
    expect(deny).toMatch(/LINE#ID mismatch/i);
    expect(deny).toMatch(/expected/i);
    expect(deny).toMatch(/got/i);
    expect(deny).not.toMatch(/unknown line/i);
    expect(deny).not.toMatch(/body mismatch/i);
  });

  it("(C) body-mismatch —— tag 正确但 body 伪造,reason 含 body mismatch / tag ok(锁 L256-265)", () => {
    const ws = tmpWorkspace();
    const fileAbs = path.join(ws, "b.ts");
    fs.writeFileSync(fileAbs, "const REAL = 1;\n", "utf8");
    const cfg = makeCfg();

    const entry = recordRead(
      makeInput(ws, { toolName: "Read", toolInput: { file_path: "b.ts" } }),
      cfg,
      "b.ts",
    );
    expect(entry).not.toBeNull();
    // 取真实 tag,但 body 写伪造文本 —— tag 命中、body 不命中磁盘行
    const realTag = entry!.lineTags[1];

    const deny = hashlinePreToolDeny(
      makeInput(ws, {
        toolName: "strreplace",
        toolInput: {
          file_path: "b.ts",
          old_string: `1#${realTag}| FAKE BODY`,
          new_string: "z",
        },
      }),
      cfg,
    );

    // 专属精确断言:body mismatch 分支(tag ok)
    expect(deny).not.toBeNull();
    expect(deny).toMatch(/body mismatch/i);
    expect(deny).toMatch(/tag ok/i);
    expect(deny).toMatch(/expected body/i);
    expect(deny).toMatch(/got body/i);
    // 不能误命中 mismatch / unknown
    expect(deny).not.toMatch(/LINE#ID mismatch/i);
    expect(deny).not.toMatch(/unknown line/i);
  });

  it("(D) anchors-without-cache —— 未 Read 直接带 tag 的 old_string,reason 含 anchors require a fresh Read(锁 L231-236)", () => {
    const ws = tmpWorkspace();
    const cfg = makeCfg();

    // 关键:文件不能有 current,否则会先撞 L187 的 "No fresh Read cache"
    // 这里用 workspaceRoot 下不存在的相对名,fs.existsSync 为 false → current=""
    const deny = hashlinePreToolDeny(
      makeInput(ws, {
        toolName: "strreplace",
        toolInput: {
          file_path: "ghost.ts",
          old_string: "1#AA| body",
          new_string: "w",
        },
      }),
      cfg,
    );

    // 锁定 anchors-without-cache 分支
    expect(deny).not.toBeNull();
    expect(deny).toMatch(/anchors require a fresh Read/i);
  });

  it("(E) 正例 —— 真实 tag + 真实 body 构造 old_string,hashlinePreToolDeny 返回 null(allow)", () => {
    const ws = tmpWorkspace();
    const fileAbs = path.join(ws, "ok.ts");
    fs.writeFileSync(fileAbs, "const OK = 1;\n", "utf8");
    const cfg = makeCfg();

    const entry = recordRead(
      makeInput(ws, { toolName: "Read", toolInput: { file_path: "ok.ts" } }),
      cfg,
      "ok.ts",
    );
    expect(entry).not.toBeNull();
    // tag 与 body 都取真实值 —— 全部校验通过
    const realTag = entry!.lineTags[1];
    const realBody = "const OK = 1;";

    const allow = hashlinePreToolDeny(
      makeInput(ws, {
        toolName: "strreplace",
        toolInput: {
          file_path: "ok.ts",
          old_string: `1#${realTag}| ${realBody}`,
          new_string: "const OK = 2;",
        },
      }),
      cfg,
    );

    expect(allow).toBeNull();
  });

  it("(F) TTL 过期 —— 小 TTL cfg 等待超过 TTL 后 hashlinePreToolDeny 返回 expired for(锁 L195)", () => {
    const ws = tmpWorkspace();
    const fileAbs = path.join(ws, "ttl.ts");
    fs.writeFileSync(fileAbs, "line one\n", "utf8");
    // 小 TTL:50ms
    const cfg = makeCfg();
    cfg.hashlineTtlMs = 50;

    recordRead(
      makeInput(ws, { toolName: "Read", toolInput: { file_path: "ttl.ts" } }),
      cfg,
      "ttl.ts",
    );

    // 等待超过 TTL(60ms > 50ms)
    const start = Date.now();
    while (Date.now() - start < 60) {
      /* spin */
    }

    const deny = hashlinePreToolDeny(
      makeInput(ws, {
        toolName: "strreplace",
        toolInput: {
          file_path: "ttl.ts",
          old_string: "line one",
          new_string: "line two",
        },
      }),
      cfg,
    );

    // 锁定 TTL 过期分支(在 isReplace 之前,先于 LINE#ID 校验)
    expect(deny).not.toBeNull();
    expect(deny).toMatch(/expired for/i);
  });

  it("(G) empty old_string on existing file —— deny (v1.1.13; was allow)", () => {
    const ws = tmpWorkspace();
    const fileAbs = path.join(ws, "empty.ts");
    fs.writeFileSync(fileAbs, "something\n", "utf8");
    const cfg = makeCfg();

    // 先 Read 建缓存,避免撞 "No fresh Read cache"
    recordRead(
      makeInput(ws, { toolName: "Read", toolInput: { file_path: "empty.ts" } }),
      cfg,
      "empty.ts",
    );

    const deny = hashlinePreToolDeny(
      makeInput(ws, {
        toolName: "strreplace",
        toolInput: {
          file_path: "empty.ts",
          old_string: "",
          new_string: "inserted",
        },
      }),
      cfg,
    );

    // 已存在文件 + 空 old_string → deny（仅新建路径允许）
    expect(deny).toMatch(/Empty old_string|already exists/i);
  });
});
