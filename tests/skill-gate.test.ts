/**
 * skill-gate.ts 纯函数单元测试套件 — 覆盖意图→技能规则匹配全矩阵。
 *
 * testability 障碍说明:
 *   INTENT_SKILL_RULES（src/features/skill-gate.ts 内部表）未导出，
 *   无法逐条断言 RegExp 对象本身。但导出的纯函数
 *   suggestedSkillsForContext(catalog, context) 是该表唯一的消费者，
 *   传入"全量种子目录"后，其返回子集即为规则匹配结果的完整投影，
 *   因此可逐条断言每个意图模式 → 命中技能集合（等价于断言规则本身）。
 *   其余公共函数（isMutatingTool / scanSkillCatalog / markSkillLoaded /
 *   skillGateDenyReason / skillGateReminder / saveLastPrompt /
 *   skillGateContext）均直接或通过 tmpdir 隔离间接测试，不改动 src。
 *
 * state 隔离: workspaceRoot + cfg.pluginData 均指向 os.tmpdir() 临时目录，
 *   不触碰真实项目的 .omg/。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  isMutatingTool,
  isSkillLoadTool,
  markSkillFromToolCall,
  markSkillLoaded,
  markSkillLoadedById,
  refreshCatalog,
  scanSkillCatalog,
  skillGateDenyReason,
  skillGateReminder,
  suggestedSkillsForContext,
  type SkillGateState,
  type SkillMeta,
} from "../src/features/skill-gate.js";
import { handlePostToolRead } from "../src/events/post-tool.js";
import { handlePreToolUse } from "../src/events/pre-tool-use.js";
import {
  saveLastPrompt,
  saveLastPrompt as persistLastPrompt,
  skillGateContext,
} from "../src/features/last-prompt.js";
import type { EnvConfig, HookInput } from "../src/protocol/types.js";

// ─── 临时目录隔离 ──────────────────────────────────────────────────────
const tmpRoots: string[] = [];

function tmpWorkspace(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "omg-skillgate-"));
  tmpRoots.push(d);
  return d;
}

afterEach(() => {
  for (const d of tmpRoots.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

// ─── 配置/输入构造器（完全类型安全，对齐 handoff.test.ts 风格）────────
function cfg(pluginData: string, over: Partial<EnvConfig> = {}): EnvConfig {
  return {
    pluginRoot: ".",
    pluginData,
    grokHome: pluginData,
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
    categoryDiscipline: false,
    todoMaxContinues: 20,
    todoMaxStagnation: 3,
    ...over,
  };
}

function input(ws: string, over: Partial<HookInput> = {}): HookInput {
  return {
    raw: {},
    event: "user-prompt",
    sessionId: "skillgate-sess",
    cwd: ws,
    workspaceRoot: ws,
    ...over,
  };
}

// ─── 种子目录：覆盖 INTENT_SKILL_RULES 引用的全部技能 id ────────────────
// 构造一个"完整"目录，使 suggestedSkillsForContext 的返回子集
// 完全由规则匹配决定（而非目录缺失导致的漏匹配）。
function meta(id: string, name: string = id): SkillMeta {
  return { id, name, path: `/skills/${id}/SKILL.md`, description: `${id} desc` };
}

const FULL_CATALOG: SkillMeta[] = [
  meta("test-driven-development"),
  meta("verification-before-completion"),
  meta("systematic-debugging"),
  meta("brainstorming"),
  meta("using-superpowers"),
  meta("writing-plans"),
  meta("prometheus-plan"),
  meta("ulw-loop"),
  meta("ralph-loop"),
  meta("requesting-code-review"),
  meta("receiving-code-review"),
  meta("hashline-edit"),
  meta("handoff"),
];

// 便利：提取返回目录中的 id 集合（小写）
function idsOf(list: SkillMeta[]): Set<string> {
  return new Set(list.map((s) => s.id.toLowerCase()));
}

// ═══════════════════════════════════════════════════════════════════════
// suggestedSkillsForContext — 逐条断言 7 条意图规则
// ═══════════════════════════════════════════════════════════════════════
describe("suggestedSkillsForContext — 意图→技能规则矩阵", () => {
  it("空目录或空上下文返回空数组（fail-fast）", () => {
    expect(suggestedSkillsForContext([], "tdd everywhere")).toEqual([]);
    expect(suggestedSkillsForContext(FULL_CATALOG, "")).toEqual([]);
    expect(suggestedSkillsForContext(FULL_CATALOG, "   ")).toEqual([]);
  });

  // 规则 1: TDD / test / debug 类（注意 TDD 规则在前，debug 单独成条）
  // v1.1.17: 收窄 — 裸 "test"/"tests" 不再触发（对齐 omo #3312 假阳性思路）
  it("TDD/unit test/vitest 等强意图 → test-driven-development + verification-before-completion", () => {
    for (const ctx of [
      "implement feature with TDD",
      "add unit tests for the module",
      "run the tests after the change",
      "write tests for the parser",
      "run the spec suite",
      "wire up vitest and jest",
      "pytest the pipeline",
    ]) {
      const got = idsOf(suggestedSkillsForContext(FULL_CATALOG, ctx));
      expect(got.has("test-driven-development")).toBe(true);
      expect(got.has("verification-before-completion")).toBe(true);
      // 不应误带 debug 技能（debug 是独立规则，纯 test 关键词不触发）
      expect(got.has("systematic-debugging")).toBe(false);
    }
  });

  it(".test. / .spec. 文件名片段触发 test 规则", () => {
    const got = idsOf(
      suggestedSkillsForContext(FULL_CATALOG, "editing foo.test.ts and bar.spec.js"),
    );
    expect(got.has("test-driven-development")).toBe(true);
    expect(got.has("verification-before-completion")).toBe(true);
  });

  it("裸 test/tests 与口语 'test later' 不触发 TDD 技能（v1.1.17）", () => {
    for (const ctx of [
      "test the network later",
      "we can test this tomorrow",
      "tests of patience",
      "A/B test the copy",
    ]) {
      const got = idsOf(suggestedSkillsForContext(FULL_CATALOG, ctx));
      expect(got.has("test-driven-development")).toBe(false);
      expect(got.has("verification-before-completion")).toBe(false);
    }
  });

  // 规则 2: debug 类
  it("debug/bug/failing/regression/stack trace → systematic-debugging", () => {
    for (const ctx of [
      "debug the failing login",
      "investigate this bug",
      "tests are failing again",
      "fix the regression from v2",
      "read the stack trace",
    ]) {
      const got = idsOf(suggestedSkillsForContext(FULL_CATALOG, ctx));
      expect(got.has("systematic-debugging")).toBe(true);
    }
  });

  // 规则 3: brainstorming / design 类
  it("brainstorm/design the/architect/ambiguous → brainstorming + using-superpowers", () => {
    for (const ctx of [
      "let's brainstorm the API shape",
      "design the new module",
      "api design for checkout",
      "act as architect for the system",
      "this requirement is ambiguous",
    ]) {
      const got = idsOf(suggestedSkillsForContext(FULL_CATALOG, ctx));
      expect(got.has("brainstorming")).toBe(true);
      expect(got.has("using-superpowers")).toBe(true);
    }
  });

  it("裸 design / design system 不触发 brainstorming（v1.1.20）", () => {
    for (const ctx of [
      "tweak design system tokens",
      "update the design tokens file",
      "read design.md",
    ]) {
      const got = idsOf(suggestedSkillsForContext(FULL_CATALOG, ctx));
      expect(got.has("brainstorming")).toBe(false);
    }
  });

  // 规则 4: plan / prometheus 类（v1.1.17 收窄裸 "plan" / "I plan to"）
  it("draft/write plan / roadmap / prometheus → writing-plans + prometheus-plan", () => {
    for (const ctx of [
      "draft a plan for the migration",
      "write a plan for auth",
      "plan the feature rollout",
      "build a roadmap",
      "engage prometheus planning",
      "/plan oauth",
    ]) {
      const got = idsOf(suggestedSkillsForContext(FULL_CATALOG, ctx));
      expect(got.has("writing-plans")).toBe(true);
      expect(got.has("prometheus-plan")).toBe(true);
    }
  });

  it("口语 'I plan to' / 裸 plan 不触发 planning 技能（v1.1.17）", () => {
    for (const ctx of [
      "I plan to refactor tomorrow",
      "we plan on shipping next week",
      "airplane mode",
    ]) {
      const got = idsOf(suggestedSkillsForContext(FULL_CATALOG, ctx));
      expect(got.has("writing-plans")).toBe(false);
      expect(got.has("prometheus-plan")).toBe(false);
    }
  });

  // 规则 5: ulw / ralph / ultrawork（v1.1.17 去掉裸 loop — for-loop 假阳性）
  it("ulw/ultrawork/ralph → ulw-loop + ralph-loop", () => {
    for (const ctx of [
      "run the ULW loop on this",
      "engage ultrawork mode",
      "start ralph for the suite",
      "activate ralph-loop",
      "use the ulw-loop skill",
    ]) {
      const got = idsOf(suggestedSkillsForContext(FULL_CATALOG, ctx));
      expect(got.has("ulw-loop")).toBe(true);
      expect(got.has("ralph-loop")).toBe(true);
    }
  });

  it("裸 loop / for-loop 不触发 ralph/ulw 技能（v1.1.17）", () => {
    for (const ctx of [
      "loop until green",
      "for loop over the array",
      "event loop latency",
    ]) {
      const got = idsOf(suggestedSkillsForContext(FULL_CATALOG, ctx));
      expect(got.has("ulw-loop")).toBe(false);
      expect(got.has("ralph-loop")).toBe(false);
    }
  });

  // 规则 6: review / PR 类（v1.1.23 收窄裸 review）
  it("code review / PR review → requesting + receiving code-review", () => {
    for (const ctx of [
      "do a code review of the diff",
      "request review of the PR",
      "open a pr for the feature",
      "review this pr please",
    ]) {
      const got = idsOf(suggestedSkillsForContext(FULL_CATALOG, ctx));
      expect(got.has("requesting-code-review")).toBe(true);
      expect(got.has("receiving-code-review")).toBe(true);
    }
  });

  it("裸 review / product review 不触发 code-review 技能（v1.1.23）", () => {
    for (const ctx of [
      "please review later",
      "product review meeting notes",
      "literature review section",
    ]) {
      const got = idsOf(suggestedSkillsForContext(FULL_CATALOG, ctx));
      expect(got.has("requesting-code-review")).toBe(false);
    }
  });

  // 规则 7: hashline 类
  it("hashline/stale edit/LINE# → hashline-edit", () => {
    for (const ctx of [
      "use hashline to edit",
      "apply a stale edit safely",
      "target LINE#42",
    ]) {
      const got = idsOf(suggestedSkillsForContext(FULL_CATALOG, ctx));
      expect(got.has("hashline-edit")).toBe(true);
    }
  });

  // 规则 8: handoff 类
  it("handoff/session summary → handoff skill", () => {
    for (const ctx of [
      "produce a handoff for next session",
      "write the session summary",
    ]) {
      const got = idsOf(suggestedSkillsForContext(FULL_CATALOG, ctx));
      expect(got.has("handoff")).toBe(true);
      expect(got.size).toBe(1); // handoff 规则只建议单个技能
    }
  });

  // 规则匹配不区分大小写
  it("意图匹配大小写不敏感", () => {
    const got = idsOf(suggestedSkillsForContext(FULL_CATALOG, "TDD with UNIT TESTS"));
    expect(got.has("test-driven-development")).toBe(true);
  });

  // 无匹配意图 → 空结果（不误报）
  it("无匹配意图返回空数组，不误报", () => {
    for (const ctx of [
      "list the files in this directory",
      "what time is it",
      "say hello world",
      "git status",
    ]) {
      expect(suggestedSkillsForContext(FULL_CATALOG, ctx)).toEqual([]);
    }
  });

  // 多规则叠加：同一上下文命中多条规则应合并去重
  it("多规则叠加时合并并去重建议集合", () => {
    // "plan the …" + "write tests" + TDD → test 规则 + plan 规则合集
    const got = idsOf(
      suggestedSkillsForContext(FULL_CATALOG, "plan the feature then write tests with TDD"),
    );
    expect(got.has("test-driven-development")).toBe(true);
    expect(got.has("verification-before-completion")).toBe(true);
    expect(got.has("writing-plans")).toBe(true);
    expect(got.has("prometheus-plan")).toBe(true);
  });

  // 目录缺失时不应返回未注册的技能（即便规则命中）
  it("目录缺失目标技能时不返回幽灵技能", () => {
    const partial: SkillMeta[] = [meta("test-driven-development")]; // 缺 verification
    const got = idsOf(suggestedSkillsForContext(partial, "use TDD"));
    expect(got.has("test-driven-development")).toBe(true);
    expect(got.has("verification-before-completion")).toBe(false);
    expect(got.size).toBe(1);
  });

  // 匹配依据是 id 或 name 任一命中（catalog 名字与 id 不同时）
  it("匹配同时考虑 id 与 name 字段", () => {
    const named: SkillMeta[] = [
      { id: "x-1", name: "Test-Driven-Development", path: "/p", description: "" },
    ];
    const got = suggestedSkillsForContext(named, "tdd it");
    expect(got.length).toBe(1);
    expect(got[0].id).toBe("x-1");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// skillGateDenyReason — 门控决策路径
// ═══════════════════════════════════════════════════════════════════════
describe("skillGateDenyReason", () => {
  const emptyState: SkillGateState = {
    schemaVersion: 1,
    loaded: [],
    catalog: FULL_CATALOG,
    updatedAt: new Date().toISOString(),
  };

  it("空目录直接放行（catalog.length === 0 → null）", () => {
    const state: SkillGateState = { ...emptyState, catalog: [] };
    expect(skillGateDenyReason(state, "tdd everything")).toBeNull();
  });

  it("TDD 意图未加载相关技能 → 拒绝并指向 test-driven-development", () => {
    const reason = skillGateDenyReason(emptyState, "implement with TDD and unit tests");
    expect(reason).not.toBeNull();
    expect(reason).toMatch(/Skill Gate|relevant|SKILL\.md/i);
    expect(reason).toMatch(/test-driven-development/i);
  });

  it("加载建议技能后放行（意图感知）", () => {
    const state: SkillGateState = {
      ...emptyState,
      loaded: ["test-driven-development"],
    };
    expect(skillGateDenyReason(state, "implement with TDD")).toBeNull();
  });

  it("加载无关技能不放行（防止读无关 skill 绕过）", () => {
    const state: SkillGateState = {
      ...emptyState,
      loaded: ["handoff"], // 与 TDD 意图无关
    };
    const reason = skillGateDenyReason(state, "implement with TDD");
    expect(reason).not.toBeNull();
    expect(reason).toMatch(/test-driven-development/i);
  });

  it("无匹配意图且未加载任何技能 → fail-closed 回退拒绝", () => {
    const reason = skillGateDenyReason(emptyState, "list files");
    expect(reason).not.toBeNull();
    expect(reason).toMatch(/Catalog sample|matching SKILL\.md/i);
  });

  it("无匹配意图但已加载至少一个技能 → fail-open 放行", () => {
    const state: SkillGateState = { ...emptyState, loaded: ["handoff"] };
    expect(skillGateDenyReason(state, "list files")).toBeNull();
  });

  it("无 context 参数等价于无匹配意图（走 fail-open 回退）", () => {
    expect(skillGateDenyReason(emptyState)).not.toBeNull(); // 未加载 → 拒绝
    const loaded: SkillGateState = { ...emptyState, loaded: ["handoff"] };
    expect(skillGateDenyReason(loaded)).toBeNull(); // 已加载 → 放行
  });

  it("拒绝理由最多列出 6 条建议（slice(0,6)）", () => {
    // 构造触发两条规则、共 7 个技能的上下文，确认输出截断
    const reason = skillGateDenyReason(
      emptyState,
      "plan with prometheus then code review the PR and write TDD tests",
    );
    expect(reason).not.toBeNull();
    // 建议条数应被截断在 6 以内
    const bulletCount = (reason!.match(/^- /gm) || []).length;
    expect(bulletCount).toBeLessThanOrEqual(6);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// skillGateReminder — 提示语生成
// ═══════════════════════════════════════════════════════════════════════
describe("skillGateReminder", () => {
  const state: SkillGateState = {
    schemaVersion: 1,
    loaded: [],
    catalog: FULL_CATALOG,
    updatedAt: new Date().toISOString(),
  };

  it("空目录返回空串", () => {
    expect(skillGateReminder({ ...state, catalog: [] }, "tdd")).toBe("");
  });

  it("包含 OMG_SKILL_GATE 标记与已加载列表", () => {
    const r = skillGateReminder(state, "tdd");
    expect(r).toContain("<OMG_SKILL_GATE>");
    expect(r).toContain("</OMG_SKILL_GATE>");
    expect(r).toContain("Loaded:");
  });

  it("匹配意图时提示建议技能", () => {
    const r = skillGateReminder(state, "design the API");
    expect(r).toMatch(/Suggested for this task/i);
    expect(r).toMatch(/brainstorming/i);
  });

  it("无匹配意图时不输出 Suggested 行", () => {
    const r = skillGateReminder(state, "say hello");
    expect(r).not.toMatch(/Suggested for this task/i);
  });

  it("全部已加载且无建议 → 简洁 loaded 摘要", () => {
    const all: SkillGateState = {
      ...state,
      loaded: FULL_CATALOG.map((s) => s.id),
    };
    const r = skillGateReminder(all, "no intent here");
    expect(r).toContain("Loaded skills:");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// isMutatingTool — 写入工具判定
// ═══════════════════════════════════════════════════════════════════════
describe("isMutatingTool", () => {
  it("识别全部写入工具名（含大小写/分隔符变体）", () => {
    for (const name of [
      "Write",
      "write",
      "WRITE",
      "StrReplace",
      "strreplace",
      "EditNotebook",
      "Delete",
      "Edit",
      "Create",
      "apply_patch",
      "MultiEdit",
      "multiedit",
    ]) {
      expect(isMutatingTool(name)).toBe(true);
    }
  });

  it("只读/未知工具不视为写入", () => {
    for (const name of [
      "Read",
      "read",
      "LS",
      "Grep",
      "Glob",
      "TodoWrite", // 注意：todoWrite 不在 MUTATING 集合
      "Bash",
      "run_terminal_command",
      "",
      undefined,
    ]) {
      expect(isMutatingTool(name)).toBe(false);
    }
  });

  it("对工具名做字符归一化（去掉非 [a-z]，含 CamelCase 无下划线）", () => {
    // "apply-patch" → "applypatch"；v1.0 起与 apply_patch 同属写入工具
    expect(isMutatingTool("apply-patch")).toBe(true);
    expect(isMutatingTool("apply_patch")).toBe(true);
    expect(isMutatingTool("search_replace")).toBe(true);
    // v1.1.5: SearchReplace / search-replace must match (old norm kept _)
    expect(isMutatingTool("SearchReplace")).toBe(true);
    expect(isMutatingTool("search-replace")).toBe(true);
    expect(isMutatingTool("WriteFile")).toBe(true);
    expect(isMutatingTool("EditFile")).toBe(true);
    // v1.1.12: NotebookEdit ≠ EditNotebook letter order
    expect(isMutatingTool("NotebookEdit")).toBe(true);
    expect(isMutatingTool("EditNotebook")).toBe(true);
    // "Write." → "write" 命中
    expect(isMutatingTool("Write.")).toBe(true);
    // v1.1.60: MCP filesystem write tools
    expect(isMutatingTool("mcp__filesystem__write_file")).toBe(true);
    expect(isMutatingTool("mcp_filesystem_write_file")).toBe(true);
    expect(isMutatingTool("mcp__filesystem__read_file")).toBe(false);
    // v1.1.61: MCP git commit
    expect(isMutatingTool("mcp__git__git_commit")).toBe(true);
    expect(isMutatingTool("mcp__git__commit")).toBe(true);
    // v1.1.62: write_query / git add / postgres execute
    expect(isMutatingTool("mcp__sqlite__write_query")).toBe(true);
    expect(isMutatingTool("mcp__git__git_add")).toBe(true);
    expect(isMutatingTool("mcp__git__git_checkout")).toBe(true);
    expect(isMutatingTool("mcp__postgres__execute")).toBe(true);
    expect(isMutatingTool("mcp__brave-search__brave_web_search")).toBe(false);
  });

  it("host aliases WriteToFile / ReplaceInFile / SaveFile (v1.1.53)", () => {
    for (const name of [
      "WriteToFile",
      "write_to_file",
      "ReplaceInFile",
      "replace_in_file",
      "ReplaceStringInFile",
      "StrReplaceEditor",
      "OverwriteFile",
      "SaveFile",
      "UpdateFile",
      "PatchFile",
      "FileEdit",
      "CreateOrUpdateFile",
      "InsertFile",
      "AppendFile",
      "RemoveFile",
      "DeletePath",
      "RmFile",
    ]) {
      expect(isMutatingTool(name), name).toBe(true);
    }
  });

  it("host aliases SearchAndReplace / RewriteFile / ApplyDiff (v1.1.56)", () => {
    for (const name of [
      "SearchAndReplace",
      "search_and_replace",
      "FindAndReplace",
      "find_and_replace",
      "RewriteFile",
      "rewrite_file",
      "ModifyFile",
      "modify_file",
      "ChangeFile",
      "change_file",
      "ApplyDiff",
      "apply_diff",
      "DiffEdit",
      "diff_edit",
      "Patch",
      "patch",
    ]) {
      expect(isMutatingTool(name), name).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// scanSkillCatalog + markSkillLoaded + refreshCatalog — 文件系统集成
// ═══════════════════════════════════════════════════════════════════════
describe("scanSkillCatalog / markSkillLoaded / refreshCatalog", () => {
  function buildPluginTree(root: string): void {
    const mk = (rel: string, body: string) => {
      const p = path.join(root, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, body, "utf8");
    };
    mk("skills/brainstorming/SKILL.md", [
      "---",
      'name: "brainstorming"',
      "description: Explore intent before building.",
      "---",
      "body",
    ].join("\n"));
    mk("skills/handoff/SKILL.md", [
      "---",
      "name: handoff",
      "description: Session transfer.",
      "---",
      "body",
    ].join("\n"));
    // vendor/superpowers 子树
    mk("vendor/superpowers/skills/test-driven-development/SKILL.md", [
      "---",
      "name: test-driven-development",
      "description: Red-green-refactor.",
      "---",
      "body",
    ].join("\n"));
    // 无 frontmatter 的 SKILL.md —— 用目录名作 id
    mk("skills/legacy-tool/SKILL.md", "# no frontmatter here\n");
    // 非 SKILL.md 文件应被忽略
    mk("skills/brainstorming/README.md", "# readme");
  }

  it("scanSkillCatalog 扫描 skills/ 与 vendor/superpowers/skills/ 两棵树", () => {
    const ws = tmpWorkspace();
    buildPluginTree(ws);
    const cat = scanSkillCatalog(ws);
    const ids = cat.map((s) => s.id);
    expect(ids).toContain("brainstorming");
    expect(ids).toContain("handoff");
    expect(ids).toContain("test-driven-development");
    expect(ids).toContain("legacy-tool"); // 无 frontmatter → 回退目录名
    // README.md 不被收录
    expect(ids).not.toContain("README");
  });

  it("解析 frontmatter 的 name 与 description", () => {
    const ws = tmpWorkspace();
    buildPluginTree(ws);
    const cat = scanSkillCatalog(ws);
    const bs = cat.find((s) => s.id === "brainstorming");
    expect(bs?.name).toBe("brainstorming");
    expect(bs?.description).toMatch(/Explore intent/i);
  });

  it("同 id 技能去重（skills 优先于 vendor）", () => {
    const ws = tmpWorkspace();
    // 两处同名 SKILL.md
    fs.mkdirSync(path.join(ws, "skills", "dup", "SKILL.md", ".."), { recursive: true });
    fs.writeFileSync(
      path.join(ws, "skills", "dup", "SKILL.md"),
      "---\nname: dup\ndescription: first\n---\n",
      "utf8",
    );
    fs.mkdirSync(path.join(ws, "vendor", "superpowers", "skills", "dup"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(ws, "vendor", "superpowers", "skills", "dup", "SKILL.md"),
      "---\nname: dup\ndescription: second\n---\n",
      "utf8",
    );
    const cat = scanSkillCatalog(ws).filter((s) => s.id === "dup");
    expect(cat.length).toBe(1);
  });

  it("refreshCatalog 持久化目录到隔离状态目录", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    buildPluginTree(ws);
    const c = cfg(data, { pluginRoot: ws });
    const state = refreshCatalog(input(ws), c);
    expect(state.catalog.length).toBeGreaterThan(0);
    const gateFile = path.join(data, "skillgate-sess", "skill-gate.json");
    expect(fs.existsSync(gateFile)).toBe(true);
    const persisted = JSON.parse(fs.readFileSync(gateFile, "utf8"));
    expect(persisted.schemaVersion).toBe(1);
    expect(persisted.catalog.length).toBe(state.catalog.length);
  });

  it("markSkillLoaded 通过目录路径登记 loaded 技能", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    buildPluginTree(ws);
    const c = cfg(data, { pluginRoot: ws });
    refreshCatalog(input(ws), c);
    const cat = scanSkillCatalog(ws);
    const target = cat.find((s) => s.id === "brainstorming")!;
    const state = markSkillLoaded(input(ws), c, target.path);
    expect(state.loaded).toContain("brainstorming");
    // 幂等：重复标记不重复 push
    const again = markSkillLoaded(input(ws), c, target.path);
    expect(again.loaded.filter((x) => x === "brainstorming").length).toBe(1);
  });

  it("markSkillLoaded 对 skill.md 路径回退目录名登记（即便目录无该 id 也尝试）", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    buildPluginTree(ws);
    const c = cfg(data, { pluginRoot: ws });
    refreshCatalog(input(ws), c);
    // 用 vendor 树下 test-driven-development 的真实路径
    const td = path.join(
      ws,
      "vendor",
      "superpowers",
      "skills",
      "test-driven-development",
      "SKILL.md",
    );
    const state = markSkillLoaded(input(ws), c, td);
    expect(state.loaded).toContain("test-driven-development");
  });

  it("isSkillLoadTool + markSkillLoadedById / Skill tool (v1.1.43)", () => {
    expect(isSkillLoadTool("Skill")).toBe(true);
    expect(isSkillLoadTool("load_skill")).toBe(true);
    expect(isSkillLoadTool("UseSkill")).toBe(true);
    expect(isSkillLoadTool("Read")).toBe(false);

    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    buildPluginTree(ws);
    const c = cfg(data, { pluginRoot: ws, skillGate: true, hashline: false });
    const inp = input(ws);
    refreshCatalog(inp, c);
    markSkillLoadedById(inp, c, "test-driven-development");
    const st = markSkillFromToolCall(
      {
        ...inp,
        toolName: "Skill",
        toolInput: { skill: "brainstorming" },
      },
      c,
    );
    expect(st.loaded).toContain("test-driven-development");
    expect(st.loaded).toContain("brainstorming");
  });

  it("Skill tool PostTool unlocks Skill Gate for subsequent Write (v1.1.43)", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    buildPluginTree(ws);
    const c = cfg(data, {
      pluginRoot: ws,
      skillGate: true,
      hashline: false,
      agentGuard: false,
    });
    const inp = input(ws);
    persistLastPrompt(inp, c, "please implement with TDD and unit tests");
    refreshCatalog(inp, c);

    // Without Skill load — TDD intent blocks Write
    const denied = handlePreToolUse(
      {
        ...inp,
        event: "pre-tool-use",
        toolName: "Write",
        toolInput: { path: path.join(ws, "foo.test.ts"), contents: "export {}\n" },
      },
      c,
    );
    expect(denied.exitCode).toBe(2);
    expect(JSON.stringify(denied.output)).toMatch(/Skill Gate/i);

    // Host Skill tool (no Read of SKILL.md)
    handlePostToolRead(
      {
        ...inp,
        event: "post-tool-read",
        toolName: "Skill",
        toolInput: { name: "test-driven-development" },
      },
      c,
    );

    const allowed = handlePreToolUse(
      {
        ...inp,
        event: "pre-tool-use",
        toolName: "Write",
        toolInput: { path: path.join(ws, "foo.test.ts"), contents: "export {}\n" },
      },
      c,
    );
    expect(allowed.exitCode).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// saveLastPrompt + skillGateContext — file_path 影响与上下文拼装（间接）
// ═══════════════════════════════════════════════════════════════════════
describe("saveLastPrompt + skillGateContext（file_path 影响）", () => {
  it("saveLastPrompt 持久化并截断超长 prompt（<=4000）", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data);
    const long = "x".repeat(5000);
    persistLastPrompt(input(ws), c, long);
    const file = path.join(data, "skillgate-sess", "last-prompt.json");
    expect(fs.existsSync(file)).toBe(true);
    const persisted = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(persisted.prompt.length).toBeLessThanOrEqual(4000);
    expect(persisted.schemaVersion).toBe(1);
  });

  it("saveLastPrompt 忽略空白 prompt（不写入）", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data);
    persistLastPrompt(input(ws), c, "   ");
    const file = path.join(data, "skillgate-sess", "last-prompt.json");
    expect(fs.existsSync(file)).toBe(false);
  });

  it("skillGateContext 拼装 last prompt + test-like file_path only", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data);
    persistLastPrompt(input(ws), c, "design the auth module");
    const ctx = skillGateContext(
      input(ws, {
        event: "pre-tool-use",
        toolInput: { file_path: "/repo/src/auth.test.ts" },
      }),
      c,
    );
    expect(ctx).toContain("design the auth module");
    expect(ctx).toContain("auth.test.ts");
    // 拼装后该上下文应同时触发 design 与 test 两条规则
    const suggested = suggestedSkillsForContext(FULL_CATALOG, ctx);
    const got = idsOf(suggested);
    expect(got.has("brainstorming")).toBe(true);
    expect(got.has("test-driven-development")).toBe(true);
  });

  it("skillGateContext 忽略非 test 路径（v1.1.16 plan_ 假阳性）", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data);
    // 仅路径含 plan — 不得触发 writing-plans
    const ctx = skillGateContext(
      input(ws, {
        toolInput: { file_path: "/repo/src/plan_executor.ts" },
      }),
      c,
    );
    expect(ctx).not.toContain("plan_executor");
    expect(suggestedSkillsForContext(FULL_CATALOG, ctx)).toEqual([]);
  });

  it("skillGateContext 兼容多种 test 文件字段命名", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data);
    for (const key of ["file_path", "path", "filePath", "target_file"] as const) {
      const ctx = skillGateContext(
        input(ws, { toolInput: { [key]: `/x/${key}.spec.ts` } }),
        c,
      );
      expect(ctx).toContain(`${key}.spec.ts`);
    }
  });

  it("无 prompt 且无 test-like file 时 context 为空字符串", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data);
    expect(skillGateContext(input(ws), c)).toBe("");
    // non-test path alone still empty
    expect(
      skillGateContext(
        input(ws, { toolInput: { path: "/repo/src/utils.ts" } }),
        c,
      ),
    ).toBe("");
  });

  it("end-to-end: prompt 写入 → context 拼装 → 门控决策联动", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data);
    // 用户提示触发 ulw 意图
    persistLastPrompt(input(ws), c, "run the ULW loop to ship");
    const state: SkillGateState = {
      schemaVersion: 1,
      loaded: [],
      catalog: FULL_CATALOG,
      updatedAt: new Date().toISOString(),
    };
    const ctx = skillGateContext(input(ws), c);
    // 未加载 ulw-loop → 拒绝
    const deny = skillGateDenyReason(state, ctx);
    expect(deny).not.toBeNull();
    expect(deny).toMatch(/ulw-loop|ralph-loop/i);
    // 加载后放行
    const ok: SkillGateState = { ...state, loaded: ["ulw-loop"] };
    expect(skillGateDenyReason(ok, ctx)).toBeNull();
  });
});
