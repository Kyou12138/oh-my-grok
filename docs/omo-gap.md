# oh-my-grok vs oh-my-openagent (omo) — capability inventory

**Date:** 2026-07-15 · **omg version:** 0.20.x  
**MAGI method:** 审视 → 执行 → 提升 (spiral)

## Legend

| Tag | Meaning |
|-----|---------|
| **shipped** | Real hooks/handlers + tests |
| **partial** | Semantics present, thinner than omo |
| **blocked** | Needs OpenCode-class plugin/tool APIs or multi-model host |

## Inventory

| omo capability | oh-my-grok | Status |
|----------------|------------|--------|
| Ralph / ultrawork / ULW loop | ULW v3 multi-goal, shell→verify, stall | **shipped** |
| Todo continuation enforcer | cooldown + **abort-window** | **shipped** (partial) |
| Prometheus plan-mode | write lock + **plan-review gate** before start-work | **shipped** |
| IntentGate / think-mode | keywords + ultrathink | **shipped** |
| Hashline LINE#ID | PreTool tag+body + Read inject + 专属测试/path.resolve(v0.12) | **partial** |
| Skill force-use | Intent Skill Gate | **shipped** |
| Comment checker | patterns + **session aggregate Stop** | **shipped** (partial vs binary) |
| Discipline agents + role lock | sticky /agent + spawn | **shipped** (partial models) |
| Idle-turn yank | fluff empty Stop | **shipped** |
| Team Mode / tmux | — | **blocked** |
| Multi-provider model matrix | — | **blocked** |
| In-plugin LSP / AST | — | **partial** |
| Built-in Exa/Context7 MCP | context7 shipped(.mcp.json),Exa 未集成 | **partial** |

## Reassessed this spiral (v0.9.1)

Platform facts: Grok Build now supports native MCP servers, `spawn_subagent` (up to 8 concurrent, each with independent context window), and an official plugin marketplace (github.com/xai-org/plugin-marketplace). omo author code-yeongyu has split LSP/AST into reusable stdio MCP servers: code-yeongyu/lsp-tools-mcp and code-yeongyu/ast-grep-skill (LLM-neutral; the pi-specific variant code-yeongyu/pi-ast-grep targets the pi coding agent, not Grok — removed from recommendations in v0.12).

| Item | Old tag | New tag | Basis |
|------|---------|---------|-------|
| Built-in Exa/Context7 MCP | blocked | **partial** | Platform supports native MCP; `.mcp.json` already carries a context7 entry (enabling it flips `disabled:false`) |
| In-plugin LSP / AST | blocked | **partial** | Full in-plugin suite remains non-goal; can opt-in to omo author's external stdio servers (lsp-tools-mcp / ast-grep-skill) as optional enhancement (pi-ast-grep removed v0.12 — pi coding agent only) |
| Background agent babysitter | blocked | **partial** | Grok Build `spawn_subagent` (8 concurrent) shipped; hooks.json registers post-tool-spawn matcher; agent-guard parses subagent roles; path is open, only the Stop gate is missing (deferred to v0.10 CATEGORY_DISCIPLINE) |
| Multi-provider model matrix | blocked | **blocked** | Still non-goal (single-host Grok) |

## Grok-feasible gaps still open (after v0.9)

1. **Background agent babysitter** — path open (spawn_subagent + post-tool-spawn matcher + agent-guard role parse), only the Stop gate is missing; folded into v0.10 CATEGORY_DISCIPLINE design  
2. **Hashline native edit tool** — host tool registration limit  
3. **Stronger AST-aware comment rewrite** — optional external binary  

## Closed this spiral (v0.10)

| Item | Behavior |
|------|----------|
| Category discipline gate | deep/visual-engineering/ultrabrain 工作且本会话零 spawn_subagent 时 Stop block 一次列出推荐 subagent;首次 spawn 后 markSpawnActivity 清除;每会话至多一次 |

## Closed this spiral (v0.9)

| Item | Behavior |
|------|----------|
| Plan-review gate | `/start-work` blocked unless plan has ## Review checked / Metis / Momus VERDICT: PASS |
| Comment aggregate | ≥3 slop hits → one Stop `COMMENT_AGGREGATE` yank |

## Closed this spiral (v0.11)

| Item | Behavior |
|------|----------|
| nested-AGENTS.md 加厚 | `directory-inject.ts` realpath 容器(safeRealpath+isInside via `fs.realpathSync.native`,堵 symlink 泄漏)+ code-point 安全截断(truncateByCodePoints,防 CJK/emoji lone surrogate);对齐 omo pi-nested-agents-md。realpath symlink 容器测试保留 skip(Windows symlink 权限,手动 / Linux CI 验证) |

## Closed this spiral (v0.12)

| Item | Behavior |
|------|----------|
| README 分发渠道 + 分级 MCP | README/README.en 新增「分发渠道」小节:GitHub 直装(主路径,`--trust`)+ 官方 marketplace 教育引导(`/plugin` 浏览 + commit-SHA pin 信任链);明确「暂未收录,用 GitHub 直装」,不写已上架。新增「可选增强(MCP)」分级:context7(已随 `.mcp.json` shipped,无需配置)/ lsp-tools-mcp + ast-grep-skill(omo 作者外部 MCP,标注非 Grok 原生 + Windows #4262 警示)。**修正** omo-gap 原文把 pi-ast-grep(pi coding agent 专用,非 Grok)当推荐 MCP 的虚假宣传风险 → 移除 pi-ast-grep,改推同作者通用 ast-grep-skill |
| hashline post-write recache 测试 | 新增 `tests/hashline.test.ts`:跨风格路径收敛(`./a` / `a` / 绝对路径)、stale-cache 拒绝、post-write recache 链路三条零覆盖分支。hashline.ts 300+ 行核心「先读后改」门禁此前无专属测试 |
| hashline 路径卫生(候选C) | `resolvePath` 用 `path.resolve` 替代 `path.join`+`path.normalize`(预防性硬化,非 bugfix;现有 normalize+toLowerCase 已使风格变体收敛) |

## Closed this spiral (v0.13)

| Item | Behavior |
|------|----------|
| verify-gate 误放行修复 | `diagnostics.ts` `isVerifiedMessage` 的 `/all tests passed/i` 子串无锚定 → `'not all tests passed'` 误判已验证、绕过 verify-gate(被 stop.ts 入口 markVerified + ralph DONE 接受)。收紧为 `\ball tests passed\b` + 否定语境排除(not/never/without/n't 前导),保留合法肯定陈述 |
| diagnostics 专属测试 | 新增 `tests/diagnostics.test.ts`(12 it):isVerifiedMessage 真值表(正例+负例)、diagStopReason 三分支(lastErrors 硬阻断/needsVerify 软提醒/diagCommand 已配返回 null)、runDiagCommand 状态分支。diagnostics.ts 此前零专属测试 |
| hashline LINE#ID 测试深化 | `tests/hashline.test.ts` 追加 7 it:unknown line/mismatch/body-mismatch/anchors-without-cache 四拒绝分支 + 正例 + TTL 过期 + empty old_string,替换 functional-gates 过宽断言 |
| 文档一致性 | omo-gap L34/L39/L93 三处 pi-ast-grep 残留(pi agent 专用,与螺旋5 README 移除矛盾)→ ast-grep-skill;inventory Hashline/Context7 状态对齐 v0.12;contract.md Env 补 OMG_DIAG_TIMEOUT_MS/OMG_HASHLINE_TTL_MS/OMG_TODO_ABORT_WINDOW_MS |
| 候选B project memory 裁定 | **defer**(推迟):CATEGORY_DISCIPLINE(v0.10)上线仅约 15h、零外部反馈,omo-gap 自标前置未满足;当前门禁单 session 纯函数式,叠跨 session 历史会让误报归因从三变量扩到双调试面。改做确定性加固项(本轮) |

## Closed this spiral (v0.14)

| Item | Behavior |
|------|----------|
| verify-gate 否定检测续修 | isVerifiedMessage v0.13 黑名单列窄(not/never/without/didn't/haven't/hasn't)漏网 don't/isn't/aren't/…n't 缩写与 rarely/hardly/barely/scarcely/seldom 频度否定 → 全部误判已验证、绕过 verify-gate(5 调用点)。补全完整否定集(不含 no,避免误拒合法 'no issue, all tests passed')|
| pre-tool 编排测试 | 新增 tests/pre-tool-orchestration.test.ts(11 it):锁 5 门禁顺序(agent-guard→mutating 短路→plan-mode→hashline→comment→skill-gate)双重断言 + 非 mutating 短路(oracle Read 直接 allow,核实 agent-guard.ts:92)+ fail-open。编排顺序此前零专属覆盖 |
| stop 编排测试 | 新增 tests/stop-orchestration.test.ts(9 it):锁 7 段优先级(isStopPaused→ralph→boulder→catDisc 2.5→todos→diag→plan→comment)+ diag soft-verify 一次窗口 + catDisc/ralph 每会话至多一次副作用 |
| 关键纠偏 | agent-guard.ts:92 对非 mutating 工具首行 return null,故 oracle 的 Read 直接 allow(非被拦);编排测试锁定真实行为而非 false-pass 假设 |

## Closed this spiral (v0.15)

| Item | Behavior |
|------|----------|
| isDoneMessage 否定漏网续修 | ralph.ts isDoneMessage 纯子串匹配 DONE_MARKERS(含 RALPH_DONE/ULW_DONE 裸标记无锚定),零否定集;processLoopStop ralph 模式对命中直接 cancelRalph 不经 gate,'not ULW_DONE' 等否定话术关闭 loop。补 NEGATED_DONE 否定集(对齐 isVerifiedMessage v0.13/v0.14)——**连续三轮同源 bug** |
| applyGoalDoneMarkers 收紧 | 双向 includes 过宽(单字符 marker 误标多 goal,绕过 multi-goal gate)→ 删反向 mk.includes(g.text) + 超短 marker<=3 仅精确相等 |
| ralph.ts 专属测试 | 新增 tests/ralph.test.ts(63 it,10 describe):isDoneMessage 真值表/parseGoals/applyGoalDoneMarkers/isVerifyShellCommand/phase 谓词/detectRalphCommand/processLoopStop 四分支/ulwDoneGate/multi-goal/noteUlwShell 联动。695 行最大模块此前零专属测试 |
| 契约锁定(未修 src) | parseGoalsFromTask 尾分号/数字单字符吞并、detectRalph 连字符、isVerifyShellCommand echo 边界 |

## Closed this spiral (v0.16)

| Item | Behavior |
|------|----------|
| todo-boulder 专属测试 | `tests/todo-boulder.test.ts`（13 it）：extractTodos / incompleteTodos 双拼写 / abort-window+cooldown+max / boulder+pause / checkbox 变体 / Stop 路径 |
| isAbortLikeStopReason 收紧 | 排除 end_turn/stop/completed/done；abort 家族词边界匹配，避免误把正常结束当 abort-window |
| hasOpenPlanCheckboxes 加固 | 支持 `*`/`+` 列表符、缩进、`- [ ]` 变体（`^\s*[-*+]\s*\[\s\]`） |

## Closed this spiral (v0.17)

| Item | Behavior |
|------|----------|
| prometheus 专属测试 | `tests/prometheus.test.ts`（30 it）：detectPlanCommand 六分支 / planFileHasReview 真值表(template 反例、unchecked VERDICT、`+` 列表、CRLF、FAIL) / startWorkFromPlan 无 plan·无 review·成功·缺文件 / planModeDeny 五分支 / UserPrompt+PreTool 生产路径 |
| planFileHasReview `+` 对齐 | checklist 已/未勾选支持 GFM `+`（与 hasOpenPlanCheckboxes 一致） |

## Closed this spiral (v0.18)

| Item | Behavior |
|------|----------|
| parseGoals 尾分隔符 | `"a;"` → `["a"]`；竖线尾同理 |
| parseGoals 单字符数字目标 | `"1) a 2) b"` → `["a","b"]`（原正则吞并） |
| detectRalph 连字符 | `"ulw-stop"` 不再 start-ulw；`ulw重构` CJK 仍有效 |
| isVerifyShell echo | `"echo npm test"` false；`"echo x && npm test"` true |

## Closed this spiral (v0.19)

| Item | Behavior |
|------|----------|
| agent-guard 专属测试 | `tests/agent-guard.test.ts`（27 it）：只读全集 / 别名 / slash>host / spawn fallback / deny 真值表 / 生产路径 |
| sticky 优先级契约 | slash-agent 压 host；spawn 不压 host agentName |

## Closed this spiral (v0.20)

| Item | Behavior |
|------|----------|
| idle-turn 专属测试 | fluff/deferral/emoji/短 I-status 真值表 + 有路径/test 证据非 idle |
| think-mode 专属测试 | ultrathink/deep/中文正例；casual "I think" 负例；UserPrompt 注入边界 |
| 生产联动 | Stop todos/ULW idle yank；UserPrompt THINK_MODE |

## Next spiral focus (提升)

v0.21 候选:

- **Background spawn follow-through**: 本会话刚 spawn 且 assistant 仅 idle/「已派出」时 Stop block 一次，要求回收子代理结果或继续主任务
- **候选B — project memory 持久层(仍 defer)**: 硬信号未变

**推荐 v0.21 = spawn follow-through Stop gate**（category-discipline 的互补：有 spawn 也要跟进，而非仅惩罚零 spawn）。

## Explicit non-goals

- Team Mode / tmux  
- Multi-provider model routing  
- Full in-plugin LSP/AST suite — **放弃** (distinct from adopting an existing external MCP server, which is an optional enhancement, not a non-goal)
- Forking omo source  

> 注："Full in-plugin LSP/AST suite"(自己从零内建 LSP/AST 工具链,放弃)≠ "接入既有外部 MCP server"(按需挂载 lsp-tools-mcp / ast-grep-skill,属可选增强)。两者明确区分,不混为一谈。(pi-ast-grep 因 pi coding agent 专用已于 v0.12 移除推荐。)

## Product thesis

Grok “must-install” = hard discipline hooks, not OpenCode multi-model OS clone. Spiral: critique real gaps → ship gates → elevate next focus.
