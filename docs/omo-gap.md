# oh-my-grok capability map (vs Vanilla Grok / omo)

**Date:** 2026-07-17 · **omg version:** **1.1.40**  
**MAGI method:** 审视 → 执行 → 提升 (spiral)

**Product peer:** omo **Codex Light** 同温层（纪律 + 状态），**不是** Ultimate 全量 OS。  
**Host truth:** [contract.md](./contract.md) — Grok 仅 **PreToolUse** 硬拦；Stop/UserPrompt stdout **丢弃**。

## Legend

| Tag | Meaning |
|-----|---------|
| **hard** | PreTool deny — model cannot skip on current Grok |
| **soft** | State machine / skills / Stop stdout (tests + future hosts; **no** host re-yank today) |
| **shipped** | Real handlers + tests |
| **partial** | Semantics present, thinner or host-limited |
| **blocked / non-goal** | Needs OpenCode-class APIs or deliberately out of scope |

## Three-column snapshot

| Capability | Vanilla Grok | **oh-my-grok** | omo Ultimate · Codex Light |
|------------|--------------|----------------|----------------------------|
| PreTool hard gates | — | **hard** Hashline / plan / guard / skill / diag / spawn | hard (wider surface) |
| Stop / idle auto-continue | — | **soft** state only (host-limited) | Ultimate often hard-ish via session.prompt |
| ULW / Ralph loops | — | **soft** + evidence gates in state | Light ≈ soft+; Ultimate richer |
| Plan-mode write lock | — | **hard** PreTool | hard |
| Multi-model matrix | host | **non-goal** | Ultimate |
| Team / tmux | — | **non-goal** | Ultimate |
| Superpowers skills | optional | bundled + **hard** skill gate | separate / partial |

## Inventory (omo semantics → omg)

| omo capability | oh-my-grok | Enforce | Status |
|----------------|------------|---------|--------|
| Ralph / ultrawork / ULW loop | ULW v3 multi-goal, shell→verify, stall | soft (+ PreTool evidence) | **shipped** |
| Todo continuation enforcer | cooldown + abort-window + **stagnation** + config | soft Stop; progress via PreTool | **shipped** (host-limited) |
| Prometheus plan-mode | write lock + plan-review before start-work | **hard** path lock | **shipped** |
| IntentGate / think-mode | keywords + ultrathink | soft inject | **shipped** |
| Hashline LINE#ID | PreTool tag+body + cache | **hard** | **shipped** (partial vs native edit tool) |
| Skill force-use | Intent Skill Gate | **hard** | **shipped** |
| Comment checker | patterns + aggregate | hard if deny mode; soft aggregate | **partial** |
| Discipline agents + role lock | sticky /agent + spawn | **hard** on mutating | **shipped** (partial models) |
| Idle-turn yank | fluff empty Stop | soft | **shipped** (host-limited) |
| Team Mode / tmux | — | — | **non-goal** |
| Multi-provider model matrix | — | — | **non-goal** |
| In-plugin LSP / AST | optional external MCP | — | **partial** |
| Built-in Exa/Context7 MCP | context7 in `.mcp.json` | — | **partial** |

## Reassessed this spiral (v0.9.1)

Platform facts: Grok Build now supports native MCP servers, `spawn_subagent` (up to 8 concurrent, each with independent context window), and an official plugin marketplace (github.com/xai-org/plugin-marketplace). omo author code-yeongyu has split LSP/AST into reusable stdio MCP servers: code-yeongyu/lsp-tools-mcp and code-yeongyu/ast-grep-skill (LLM-neutral; the pi-specific variant code-yeongyu/pi-ast-grep targets the pi coding agent, not Grok — removed from recommendations in v0.12).

| Item | Old tag | New tag | Basis |
|------|---------|---------|-------|
| Built-in Exa/Context7 MCP | blocked | **partial** | Platform supports native MCP; `.mcp.json` already carries a context7 entry (enabling it flips `disabled:false`) |
| In-plugin LSP / AST | blocked | **partial** | Full in-plugin suite remains non-goal; can opt-in to omo author's external stdio servers (lsp-tools-mcp / ast-grep-skill) as optional enhancement (pi-ast-grep removed v0.12 — pi coding agent only) |
| Background agent babysitter | blocked | **shipped** (partial) | category-discipline + spawn-followthrough **≤2 yanks/wave** + result-recovery language (v1.0) |
| Multi-provider model matrix | blocked | **blocked** | Still non-goal (single-host Grok) |

## Grok-feasible gaps still open (post-1.0)

1. **Hashline native edit tool** — host tool registration limit (in-plugin gate is shipped)  
2. **Stronger AST-aware comment rewrite** — optional external binary  
3. **Full project-memory** — still defer unless hard signals  

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

## Closed this spiral (v0.21)

| Item | Behavior |
|------|----------|
| spawn follow-through | PostTool spawn → pending；Stop idle/spawn-announce → block 一次；实质进展清 pending |
| Stop order 2.6 | contract + stop.ts after category-discipline |
| tests | `tests/spawn-followthrough.test.ts` 8 it |
| README 同步 | 中英 harness 表补 plan-review / spawn follow-through；en 对齐 start-work 评审要求 |

## Closed this spiral (v0.22)

| Item | Behavior |
|------|----------|
| comment-checker 专属测试 | `tests/comment-checker.test.ts`（12 it）：slop 真值表 / aggregate 阈值 / deny / postWarn |

## Closed this spiral (v0.23)

| Item | Behavior |
|------|----------|
| intent ulw- 对齐 | `ulw-stop` 不触发 ultrawork intent |
| intent 优先级 | search → debug → analyze；中文 查找/调试/分析 |
| category CJK `\b` | 中文分类关键词去掉 `\b`（JS 词边界对 CJK 无效） |
| unspecified-low | tweak/微调/润色 路径激活 |
| tests | `tests/intent-category.test.ts` 18 it |
| 定时 | MAGI scheduler **30m**（原 4h） |

## Closed this spiral (v0.24)

| Item | Behavior |
|------|----------|
| init-deep 中间目录 | `hasCodeFilesDeep` 有界递归，深路径父目录也生成 AGENTS.md |
| init-deep 专属测试 | `tests/init-deep.test.ts` 9 it |

## Closed this spiral (v0.25–v0.26)

| Item | Behavior |
|------|----------|
| fingerprint 版本 | 读 `package.json`，不再硬编码 0.16.0 |
| SessionStart rules | 启动注入 AGENTS.md + plugin rules |
| alive 横幅 | 首轮 UserPrompt 使用真实版本号 |
| session-start tests | 11 it |
| hard-orchestration | UserPrompt 开关 + banner 专属测试 |
| session-end | promptCount 重置锁定 |

## Closed this spiral (v0.27)

| Item | Behavior |
|------|----------|
| protocol parse 矩阵 | 11 it：畸形 JSON、array、env 回填、agent/stop/firstPrompt 别名 |

## Closed this spiral (v0.28)

| Item | Behavior |
|------|----------|
| cli fail-open e2e | 子进程 `dist/cli.js`：未知 event、空 stdin、畸形 JSON、pre-tool allow |

## Closed this spiral (v0.29)

| Item | Behavior |
|------|----------|
| 验收清单 | `docs/acceptance.md` 可勾选摸测路径 + 反馈模板 |

## Closed this spiral (v0.30)

| Item | Behavior |
|------|----------|
| handoff resume | SessionStart 注入最新 `.omg/handoffs/*` 摘要 `OMG_HANDOFF_RESUME` |
| findLatestHandoff | mtime 选最新；无目录 null |

## Closed this spiral (v1.0.0)

| Item | Behavior |
|------|----------|
| Hashline P0 | deny How-to-fix；matcher 扩 search_replace/WriteFile/…；README 用法 |
| Spawn P1 | 每 wave 最多 2 次 yank；get_task_output / 回收话术清 pending |
| Session resume P2 | `OMG_SESSION_RESUME`：ULW/boulder/todos/handoff 摘要 |
| **Stable** | 公共 hook 契约冻结；breaking → 2.0 |

## Closed this spiral (v1.0.1)

| Item | Behavior |
|------|----------|
| boulder plan 优先 | `hasOpenPlanCheckboxes` 先扫 active boulder.planPath（去重） |
| session-resume | boulder 下提示 open plan checkboxes |
| omo-gap 清理 | 过时「babysitter 仅缺 Stop」条目移除 |

## Closed this spiral (v1.0.2)

| Item | Behavior |
|------|----------|
| tool-path recovery | `get_task_output` PostTool 清 spawn follow-through pending |
| inline spawn result | 实质 toolOutput 不 arm pending |
| hooks matcher | 注册 get_task_output / get_command_or_subagent_output |

## Closed this spiral (v1.1.0)

| Item | Behavior |
|------|----------|
| grok-build 源码对齐 | `toolResult` coerce、`subagentType`、contract PreTool-only 真相 |
| SubagentStart/End | host 生命周期 arm/clear spawn follow-through（hooks.json 注册 End 非 Stop） |

## Closed this spiral (v1.1.1)

| Item | Behavior |
|------|----------|
| **parent sticky poison** | PostTool spawn / SubagentStart **不再**把父会话 sticky 锁成子角色；避免主会话 Write 被 AGENT_GUARD 误拦 |
| sticky 来源收紧 | 仅 `/agent` 与 host `agentName`；spawn 只 arm follow-through + category mark |

## Closed this spiral (v1.1.2)

| Item | Behavior |
|------|----------|
| **category-discipline → PreTool** | deep/visual/ultrabrain + 0 spawn 时**首次 mutating 工具 deny 一次**（宿主可强制）；与 Stop 共用 once 标志 |
| PreTool 顺序 | agent-guard → plan-mode → category-discipline → hashline → comment → skill-gate |

## Closed this spiral (v1.1.3)

| Item | Behavior |
|------|----------|
| **SubagentEnd ≠ recovered** | End 不再 clear follow-through；标记 `childFinished`，父会话仍需 get_task_output / 实质进展 |
| End-miss Start | 仅 End 也会 arm pending，避免 Start 丢失时无 yank |

## Closed this spiral (v1.1.4)

| Item | Behavior |
|------|----------|
| **spawn-followthrough → PreTool** | `childFinished` + pending 时**首次 mutating deny 一次**；子 agent 仍在跑时允许父会话并行改代码 |
| PreTool 顺序 | … category-discipline → spawn-followthrough → hashline … |

## Closed this spiral (v1.1.5)

| Item | Behavior |
|------|----------|
| **isMutatingTool 归一化** | `SearchReplace` / `search-replace` 等 CamelCase 无下划线名正确识别为 mutating（PreTool 全门禁入口） |
| **diag → PreTool hard** | `lastErrors`（diagCommand 失败）时 deny 继续编辑直至 clean；soft needsVerify 仍仅 Stop |

## Closed this spiral (v1.1.6)

| Item | Behavior |
|------|----------|
| **Hashline isReplace 归一化** | `SearchReplace` / `search-replace` 进入 old_string + LINE#ID 校验（与 v1.1.5 mutating 同源缺口） |

## Closed this spiral (v1.1.7)

| Item | Behavior |
|------|----------|
| **hooks exact names** | Pre/Post matcher 补 SearchReplace 等（宿主 simple matcher 大小写敏感精确匹配） |
| **comment PreDeny** | SearchReplace / apply_patch 纳入 slop 扫描 |
| **isSpawnTool** | spawn-subagent 等连字符名 |

## Closed this spiral (v1.1.8)

| Item | Behavior |
|------|----------|
| **recovery tool 对齐** | `isResultRecoveryTool` 覆盖 task_output / wait_tasks / terminal output / *subagentoutput* |
| **host plan mode** | enter_plan_mode / exit_plan_mode PostTool 同步 oh-my-grok plan-mode 门禁 |

## Closed this spiral (v1.1.9)

| Item | Behavior |
|------|----------|
| **todo_write merge** | 默认 merge 按 id 合并；status-only 保留文案；不全表替换 |
| **enforcer reset** | 仅当 mirror 中**全部** todo 关闭时 reset（不再被本批全完成误触发） |

## Closed this spiral (v1.1.10)

| Item | Behavior |
|------|----------|
| **Hashline Grok N→** | old_string 匹配前剥离 `read_file` 的 `N→` 前缀，减少误报 stale |

## Closed this spiral (v1.1.11) — omo issues

| omo issue / constant | oh-my-grok |
|----------------------|------------|
| [#6133](https://github.com/code-yeongyu/oh-my-openagent/issues/6133) continuation config | `todoCooldownMs` / `todoAbortWindowMs` / `todoMaxContinues` / `todoMaxStagnation` 可配置 |
| `MAX_STAGNATION_COUNT=3` | 相同 open-todo 指纹连续 yank ≥N → circuit open（idle 也不再 nag） |
| [#6001](https://github.com/code-yeongyu/oh-my-openagent/issues/6001) skill reminder 污染 tool output | Grok 非 PreTool stdout 被丢弃 → **天然免疫**；不把 reminder 拼进 toolResult |
| [#74](https://github.com/code-yeongyu/oh-my-openagent/issues/74) memory | 仍 **defer**（作者亦认为易冗余） |
| Team/tmux, multi-model, container subagents | **blocked** / non-goal on Grok |

## Closed this spiral (v1.1.12)

| Item | Behavior |
|------|----------|
| **NotebookEdit** | isMutatingTool + PreTool matcher（此前 CamelCase 漏网） |
| **Grok tool names** | Sisyphus/rules 主推 `task` + `get_task_output`；弱化绝对委托语气（omo #6129 方向） |

## Closed this spiral (v1.1.13)

| Item | Behavior |
|------|----------|
| **empty old_string** | 已存在文件禁止空 old_string（仅新建路径允许） |
| **idle 中文** | 稍等/稍后继续等短状态废话 → idle yank |

## Closed this spiral (v1.1.14)

| Item | Behavior |
|------|----------|
| **verify hedge** | `all tests passed except/but/almost` 不得 markVerified |
| **中文 VERIFIED** | 全部/所有测试通过（否定句拒绝） |

## Closed this spiral (v1.1.15)

| Item | Behavior |
|------|----------|
| **DONE hedge** | `ULW_DONE except/but/almost` / 中文未完成 不得 cancelRalph |
| **empty Write wipe** | 已存在文件 + 空 contents → PreTool deny |

## Closed this spiral (v1.1.16)

| Item | Behavior |
|------|----------|
| **skillGate path 收窄** | 仅 `.test.`/`.spec.` 等 test-like 路径进意图上下文；`plan_*.ts` 不再误触 writing-plans |

## Closed this spiral (v1.1.17) — omo issues

| omo issue / theme | oh-my-grok |
|-------------------|------------|
| [#3312](https://github.com/code-yeongyu/oh-my-openagent/issues/3312) substring false positives | INTENT_SKILL_RULES 去掉裸 `tests?`/`plan`/`loop`；保留强短语 |
| [#6094](https://github.com/code-yeongyu/oh-my-openagent/issues/6094) prose Todos → Boulder 0/0 | `/start-work` 在 review 通过后仍要求 ≥1 带标签 task checkbox（排除 ## Review；空 `- [ ]` 不计）→ 否则 `PLAN_FORMAT` |
| [#6133](https://github.com/code-yeongyu/oh-my-openagent/issues/6133) continuation config | 已于 v1.1.11 shipped |
| [#6001](https://github.com/code-yeongyu/oh-my-openagent/issues/6001) skill reminder 污染 | Grok 非 PreTool stdout 丢弃 → 免疫 |
| [#74](https://github.com/code-yeongyu/oh-my-openagent/issues/74) memory | 仍 **defer** |
| [#5806](https://github.com/code-yeongyu/oh-my-openagent/issues/5806) ULW edge vs level | Ralph state 已是 session-level（非关键词每轮）— 已 level-triggered |
| [#4217](https://github.com/code-yeongyu/oh-my-openagent/issues/4217) subagent stall | partial via spawn-followthrough；真 stall timer 需 host task 进度 API |
| [#5970](https://github.com/code-yeongyu/oh-my-openagent/issues/5970) evidence receipt | Codex-only evidence dir — N/A on Grok |

## Closed this spiral (v1.1.18)

| Item | Behavior |
|------|----------|
| **empty checkbox stuck** | `hasOpenPlanCheckboxes` 忽略空 `- [ ]` + 跳过 `## Review`；避免 VERDICT 通过后 Review 未勾永久卡住 boulder |
| **omo [#6066](https://github.com/code-yeongyu/oh-my-openagent/issues/6066)** start-work Goal | `/start-work` 在 todos mirror 为空时从 plan 任务行 seed todos → Stop todo continuation 可跟踪执行进度 |
| **parsePlanTaskCheckboxes** | 与 countPlanTaskCheckboxes / seed 共用语法 |

## Closed this spiral (v1.1.19) — omo issues

| omo issue | oh-my-grok |
|-----------|------------|
| [#1775](https://github.com/code-yeongyu/oh-my-openagent/issues/1775) no-progress / blocked on human | `blocked`/`deferred`/`waiting`/`on_hold`/`paused` 不算 incomplete → 不再 yank continuation |
| [#4111](https://github.com/code-yeongyu/oh-my-openagent/issues/4111) all todos complete silent stop | Stop 一次性 `ALL_TODOS_COMPLETE` 要求用户向摘要；非 idle 长回复直接标记已 signal |
| [#4744](https://github.com/code-yeongyu/oh-my-openagent/issues/4744) Atlas loop after complete | 受益于 #1775 状态 + stagnation（v1.1.11）+ #4111 完成信号 |

## Closed this spiral (v1.1.20)

| Item | Behavior |
|------|----------|
| **plan↔todo sync** | 写 plan / boulder Stop 时 `syncTodosFromPlanCheckboxes`：plan 行 `[x]` → 对应 `plan-N`/同标签 todo 完成；避免只改 markdown 不改 todo_write 的永久 yank |
| **skill design 收窄** | 裸 `design` / design system 不再触发 brainstorming |

## Closed this spiral (v1.1.21) — honesty / narrative

| Item | Behavior |
|------|----------|
| **README ⊆ contract** | 去掉「Stop 强制续跑」overclaim；主 slogan = Harness Light + PreTool 硬门禁 |
| **三列对照** | Vanilla Grok / oh-my-grok / omo Ultimate·Codex Light；Stop 标 host-limited |
| **acceptance L2** | 真机必过项 = install + doctor + PreTool deny 探针 |
| **design spec** | 2026-07-11 Stop 驱动续跑 → 标 **superseded by contract.md** |

## Closed this spiral (v1.1.22) — PreTool hard

| Item | Behavior |
|------|----------|
| **MultiEdit path bypass** | `pathsFromToolInput` → Hashline / plan-mode 扫描 `edits[]`；无 path 的 MultiEdit fail-closed |
| **doctor PreTool probe** | `npm run doctor` 子进程跑 blind `search_replace`，断言 Hashline deny（不依赖 Grok TUI） |

## Closed this spiral (v1.1.23) — PreTool hard

| Item | Behavior |
|------|----------|
| **apply_patch paths** | `*** Update/Add/Delete File:` 进入 Hashline / plan-mode |
| **comment MultiEdit** | `edits[].new_string` slop 进入 PreTool deny / PostTool warn |
| **post-tool multi-path** | 每个写入路径 recache + plan checkbox sync |
| **skill review 收窄** | 裸 `review` 不再触发 code-review 技能 |

## Closed this spiral (v1.1.24) — PreTool hard + resume wow

| Item | Behavior |
|------|----------|
| **MultiEdit old_string** | 每条 `edits[]` 校验 empty/stale old_string（防绕过单文件校验） |
| **markDirty multi-path** | diag dirty 覆盖 batch 全部路径 |
| **SessionStart resume** | 无状态也注入 `OMG_SESSION_RESUME` + PreTool 提示；Sisyphus bootstrap 写死 hard gates |

## Closed this spiral (v1.1.25) — PreTool hard

| Item | Behavior |
|------|----------|
| **spawn/task AGENT_GUARD** | read-only（oracle/explore/…）与 no-redelegate（atlas/momus/…）禁止 `task`/`spawn_subagent`；hooks PreTool matcher 注册 spawn 工具 |
| **NotebookEdit PostTool** | write matcher 补齐 recache/dirty |
| **createfile** | isMutatingTool + PreTool matcher |

## Closed this spiral (v1.1.26) — PreTool hard

| Item | Behavior |
|------|----------|
| **prometheus role lock** | sticky/host prometheus 仅允许写 `.omg/plans/`（与 plan-mode 独立） |
| **skill-gate plan skip** | plan-mode 下纯 plan 路径写入不触发 Skill Gate（避免 TDD 意图卡写作 plan） |

## Closed this spiral (v1.1.27) — ULW ceremony

| Item | Behavior |
|------|----------|
| **omo-style opener** | ULW 启动注入 `ULTRAWORK MODE ENABLED!` 开场要求 + `<ultrawork-mode>` |
| **CEREMONY.md** | 落盘 `.omg/ulw-loop/CEREMONY.md`（宿主丢 inject 时仍可读） |
| **resume** | SessionStart 活跃 ULW 时提醒开场白 |

## Closed this spiral (v1.1.28) — gate false-neg / false-pos

| Item | Behavior |
|------|----------|
| **CreateFile wipe** | `isFullWrite` 含 `createfile` — 空 contents 擦已有文件 PreTool deny |
| **NotebookEdit isReplace** | 排除 notebookedit/editnotebook；仅要求 Read cache，不强制 old_string |
| **comment Create\*** | isCommentScanTool 含 create/createfile |
| **DONE/VERIFIED hedges** | cannot/unable/impossible/refuse/missing/far from + 无法/不能/没法/难以 |
| **hooks snake_case** | write_file / create_file / delete_file / multi_edit 等进 Pre/Post matcher |

## Closed this spiral (v1.1.29) — path boundary

| Item | Behavior |
|------|----------|
| **path-boundary** | `canonicalizeTargetPath` + `isPathInside` / `isTargetInside`（realpath 祖先 + 相对路径规则） |
| **prometheus plan paths** | plan-mode / role 锁用容器判定，抗 `../`、跨盘、假 `.omg/plans` 子串 |
| **isPlanMarkdownPath** | plan↔todo sync 同边界；拒 workspace 外 `.../.omg/plans/` |
| **directory-inject** | 外部 symlink 规则文件不注入 |

## Closed this spiral (v1.1.30) — ULW 开场仪式感

| Item | Behavior |
|------|----------|
| **ulwCeremonyBanner** | 框线 + 【开场仪式 OPENING RITUAL】三步 + 禁止项 + 推巨石收束 |
| **active/upgrade** | 续跑/Ralph 晋升同样有仪式框 |
| **CEREMONY.md / skill** | 磁盘 + ulw-loop skill 同步仪式步骤 |

## Closed this spiral (v1.1.31) — Hashline pathless fail-closed

| Item | Behavior |
|------|----------|
| **pathless mutating deny** | Write/StrReplace/Create/Delete/ApplyPatch 无路径 → PreTool deny（对齐 MultiEdit） |
| **apply_patch parse** | `File :` 空格 + `diff --git` / `--- +++` 路径回退 |

## Closed this spiral (v1.1.32) — workspace write boundary

| Item | Behavior |
|------|----------|
| **workspaceBoundaryDeny** | mutating 路径必须在 `workspaceRoot` 内；`../` / 盘外 abs / MultiEdit 部分逃逸 → PreTool deny |
| **independent of Hashline** | Hashline=off 仍拦逃逸写 |
| **path-boundary reuse** | 与 plan/prometheus 同一 canonicalize 容器判定 |

## Closed this spiral (v1.1.33) — OpenCode-style PostTool matchers

| Item | Behavior |
|------|----------|
| **PostTool read** | `read` / `read-file` — Hashline + Skill Gate 加载才能触发 |
| **PostTool todo** | `todowrite` / `todo-write` — todo 镜像不再静默丢事件 |
| **PostTool shell** | `bash` / `shell` — ULW shell→verify 可计活动 |
| **host truth** | matcher 精确大小写；漏 alias = 整段 PostTool 不跑 |

## Closed this spiral (v1.1.34) — Hashline CRLF/LF match

| Item | Behavior |
|------|----------|
| **contentIncludes** | old_string↔disk 先精确再 LF 归一；CRLF 文件 + LF paste 不再假 stale |
| **MultiEdit** | edits[].old_string 同规则 |
| **still deny** | 真内容不一致仍 PreTool deny |

## Closed this spiral (v1.1.35) — agent-guard mutating shell

| Item | Behavior |
|------|----------|
| **read-only shell** | oracle/explore/… 不得 `>`/`rm`/`git commit`/install；ls/status/npm test 仍允许 |
| **PreTool matcher** | Bash|Shell|run_terminal_command 进入 agent-guard（此前 shell 完全不走 PreTool） |
| **implementers** | hephaestus/sisyphus 不受限 |

## Closed this spiral (v1.1.36) — plan/prometheus shell bypass

| Item | Behavior |
|------|----------|
| **pre-tool shell lane** | shell 不再因 `!isMutatingTool` 直接 allow；先过 role + plan-mode |
| **planModeDeny shell** | plan-mode 下 mutating shell deny；调查类 shell 仍允许 |
| **prometheusRoleDeny shell** | sticky prometheus 同规则 |

## Closed this spiral (v1.1.37) — shell one-liner write bypass

| Item | Behavior |
|------|----------|
| **node/python -e/-c** | writeFileSync / open w / write_text → mutating |
| **curl/wget -o** | download-to-file → mutating |
| **pip/cargo/go install** | package install → mutating |
| **still allow** | console.log / print / curl without -o |

## Closed this spiral (v1.1.38) — shell argv array join

| Item | Behavior |
|------|----------|
| **getShellCommand** | `command: string[]` → space-join（禁 `String(arr)` 逗号拼接） |
| **args/argv** | string command + args[] 合并检测 |
| **why** | `node,-e,writeFileSync…` 曾绕过 v1.1.37 模式 |

## Closed this spiral (v1.1.39) — PostTool shell argv → ULW verify

| Item | Behavior |
|------|----------|
| **handlePostToolShell** | 复用 getShellCommand；`["npm","test"]` 计入 verify |
| **why** | PreTool 已修 argv，PostTool 仍 String() → ULW verify 假阴 |

## Closed this spiral (v1.1.40) — ULW verify modern runners

| Item | Behavior |
|------|----------|
| **VERIFY_SHELL_RE** | + `bun test` / `bun run test` / `deno test` / `yarn run test` / `make test` |
| **why** | 现代工具链跑测不计 verify → DONE 证据门假阴 |

## Next spiral focus (提升)

- **marketplace** + 传播资产（GIF）— 安装转化  
- **Harness Light 架构** → [harness-light-architecture.md](./harness-light-architecture.md)  
- Hashline native edit tool（宿主能力）  
- project-memory 仍 defer（omo #74）  

**推荐**: pin **v1.1.40** · `grok plugin update`。

## Explicit non-goals

- Team Mode / tmux  
- Multi-provider model routing  
- Full in-plugin LSP/AST suite — **放弃** (distinct from adopting an existing external MCP server, which is an optional enhancement, not a non-goal)
- Forking omo source  
- Pretending host has OpenCode-class Stop re-prompt  

> 注："Full in-plugin LSP/AST suite"(自己从零内建 LSP/AST 工具链,放弃)≠ "接入既有外部 MCP server"(按需挂载 lsp-tools-mcp / ast-grep-skill,属可选增强)。两者明确区分,不混为一谈。(pi-ast-grep 因 pi coding agent 专用已于 v0.12 移除推荐。)

## Product thesis

Grok “must-install” = **hard PreTool discipline** + honest soft state machines — **not** an OpenCode multi-model OS clone.  
Narrative: **A (Grok 最佳纪律插件) + B 诚实版 (omo 语义 Grok Adapter)**. KPI = hard-gate reliability + install conversion.
