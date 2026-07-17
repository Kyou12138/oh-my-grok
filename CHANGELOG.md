# Changelog

All notable changes to this project are documented here.

## [1.1.32] — 2026-07-17

### MAGI spiral — workspace write boundary (hard PreTool)

- **feat(workspace-boundary)** mutating tools cannot escape `workspaceRoot` via `../` or foreign absolute paths (realpath containment, same helpers as plan path boundary)
- **wire** PreTool order: after prometheus-role, before plan-mode; independent of Hashline on/off
- **docs** contract + CONTRIBUTING PreTool order
- **test** isWorkspaceWritePath + MultiEdit partial escape + ApplyPatch outside + hashline-off still deny

## [1.1.31] — 2026-07-17

### MAGI spiral — Hashline pathless fail-closed + apply_patch parse

- **fix(hashline)** pathless mutating tools (Write / StrReplace / Create / Delete / ApplyPatch empty body) now **deny** — previously only MultiEdit failed closed; others returned null and skipped Hashline
- **feat(tool-paths)** apply_patch: optional space before `File :`; unified `diff --git a/… b/…` + `---/+++` path fallback
- **test** pathless matrix + spaced File colon + git-diff paths

## [1.1.30] — 2026-07-17

### ULW 开场仪式感 (ceremony ritual)

- **feat(ulw)** `ulwCeremonyBanner` 完整开场仪式：框线 `═══`、【开场仪式 OPENING RITUAL】三步（第一行口号 → 复述目标 → 立即 explore）、禁止项、推巨石收束
- **feat** active / upgrade 变体同样带框线与仪式语；`CEREMONY.md` 标题中英
- **docs** `skills/ulw-loop` 开场仪式步骤；SessionStart resume 指向仪式
- **test** ritual frame / 1-2-3 steps / upgrade / inject 断言
- **soft** — 仍为 inject + 磁盘提醒，不硬拦 end_turn

## [1.1.29] — 2026-07-17

### MAGI spiral — path boundary + plan markdown path

- **feat** shared `path-boundary` (`canonicalizeTargetPath` / `isPathInside` / `isTargetInside`) for plan gates + directory inject
- **fix(prometheus)** plan-mode / prometheus-role use canonical containment (no `includes(".omg/plans")` escape)
- **fix(isPlanMarkdownPath)** same boundary for post-write plan↔todo sync; reject foreign `.../.omg/plans/` substrings
- **fix(directory-inject)** reject external AGENTS/rule file links via realpath containment
- **test** path-boundary suite + isPlanMarkdownPath evil-path matrix

## [1.1.28] — 2026-07-16

### MAGI spiral — gate false-negatives / false-positives

- **fix(hashline)** `CreateFile`/`createfile` empty contents on existing file now denied (wipe gate was only `write|writefile|create`)
- **fix(hashline)** NotebookEdit / EditNotebook no longer require `old_string` (`isReplace` no longer matches `*edit*` via `includes("edit")`)
- **fix(comment-checker)** Create / CreateFile content scanned under deny mode
- **fix(ralph/diagnostics)** DONE / VERIFIED: `cannot|unable|impossible|refuse|missing|far from` + 中文 `无法|不能|没法|难以` 不得误关 loop / 误 markVerified
- **fix(hooks)** Pre/Post write matcher snake_case aliases: `write_file` / `create_file` / `delete_file` / …
- **fix(ralph)** cancelRalph also removes `.omg/ulw-loop/CEREMONY.md`
- **test** hashline CreateFile+NotebookEdit; comment CreateFile; DONE/VERIFIED hedges; hooks snake aliases; ceremony cleanup

## [1.1.27] — 2026-07-16

### ULW opening ceremony (omo-style)

- **feat(ulw)** on start: inject `<ultrawork-mode>` with **`ULTRAWORK MODE ENABLED!`** opener requirement (+ Chinese variant)
- **feat** write `.omg/ulw-loop/CEREMONY.md` so ceremony survives if UserPrompt inject is dropped
- **feat** SessionStart resume line when ULW active; `skills/ulw-loop` documents opener
- **soft** — does not hard-block end_turn; model is instructed to open loudly

## [1.1.26] — 2026-07-16

### MAGI spiral — Prometheus role lock + plan-mode Skill Gate skip

- **feat(prometheusRoleDeny)** sticky/host `prometheus` may only mutate `.omg/plans/*` (PreTool hard)
- **fix(skill-gate)** skip when plan-mode is active and **all** paths are plan-only — `/plan` drafting no longer blocked by unrelated TDD/design intent
- **docs** contract PreTool order + CONTRIBUTING order updated
- **test** prometheus role deny/allow; isPlanModePlanOnlyWrite; PreTool plan Write allows under TDD last-prompt

### Release hygiene (same version)

- **docs** `install-60s.md` L2 path + troubleshooting; acceptance feedback template unpinned from 1.1.21
- **test** `hooks-matcher.test.ts` — PreTool/PostTool matcher ↔ `MUTATING_TOOL_IDS` / spawn
- **export** `MUTATING_TOOL_IDS` for matcher single-source guard
- **GitHub** description → Harness Light; tag **v1.1.26**

## [1.1.25] — 2026-07-16

### MAGI spiral — Agent Guard spawn/task PreTool + NotebookEdit post-write

- **feat(agent-guard)** PreTool deny `task` / `spawn_subagent` for **read-only** roles and **no-redelegate** roles (atlas/momus/sisyphus-junior) — host-enforced when matcher fires
- **hooks** PreTool matcher adds spawn/task names; PostTool write adds NotebookEdit variants; CreateFile
- **fix(isMutatingTool)** `createfile` recognized
- **test** oracle/explore spawn deny; atlas task deny; sisyphus allow

## [1.1.24] — 2026-07-16

### MAGI spiral — MultiEdit old_string gate + SessionStart hard-gate tip

- **fix(hashline)** MultiEdit validates each `edits[].old_string` (empty/stale deny) — closes bypass of single-path old_string checks
- **fix(post-tool)** `markDirty` for every path in MultiEdit/apply_patch batch
- **feat(session-resume)** always emit `OMG_SESSION_RESUME` (empty-state still reminds PreTool/Hashline)
- **docs(sisyphus)** bootstrap lists host-enforced PreTool hard gates
- **feat(tool-paths)** `notebook_path` for NotebookEdit
- **test** MultiEdit stale/empty/allow matrix; resume empty banner

## [1.1.23] — 2026-07-16

### MAGI spiral — apply_patch paths + MultiEdit comment scan

- **feat(tool-paths)** parse `*** Update/Add/Delete File:` from apply_patch bodies; `contentSnippetsFromToolInput` for MultiEdit
- **fix(hashline/plan-mode)** apply_patch paths enter PreTool path gates
- **fix(comment-checker)** scan MultiEdit `edits[].new_string` for slop (deny mode)
- **fix(post-tool)** recache + plan-todo sync for **all** written paths
- **fix(skill-gate)** bare `review` no longer forces code-review skills
- **test** apply_patch deny; MultiEdit slop; review negatives

## [1.1.22] — 2026-07-16

### MAGI spiral — MultiEdit path gates + doctor PreTool probe

Hard PreTool (host-enforced), not Stop vanity:

- **fix(hashline)** `pathsFromToolInput` — MultiEdit `edits[]` / `files[]` no longer bypass Read-before-edit; empty MultiEdit fails closed
- **fix(plan-mode)** plan lock checks **all** paths in a batch (mixed plans + `src/` denied)
- **feat(doctor)** live PreTool probe: spawn `dist/cli.js pre-tool-use` blind edit → expect Hashline deny (L2 wow path without Grok TUI)
- **test** `tests/tool-paths.test.ts`

## [1.1.21] — 2026-07-16

### Docs honesty — README ⊆ contract (Harness Light)

Product narrative alignment with grok-build host limits (only PreTool hard-blocks):

- **README / README.en** — slogan = PreTool hard gates + agents/skills; remove “Stop force-continue” overclaim; 30s wow = blind-edit deny + plan lock; ULW Stop marked host-limited
- **omo-gap** — three columns Vanilla / omg / omo Ultimate·Codex Light; hard vs soft enforce tags; peer = Codex Light
- **acceptance** — L0 CI · L2 live PreTool probes; Stop yank **not** required
- **design spec 2026-07-11** — supersede Stop-driven re-prompt assumption
- **CONTRIBUTING** — P0 funnel = PreTool; matcher case note; pure logic vs host I/O

## [1.1.20] — 2026-07-16

### MAGI spiral — plan↔todo sync + design skill narrow

- **fix(start-work flow)** after seed todos (v1.1.18), flipping plan `- [x]` without `todo_write` left mirror pending forever → Stop yank loop. **`syncTodosFromPlanCheckboxes`** promotes matching `plan-N` / label todos on plan write + boulder Stop
- **fix(skill-gate)** drop bare `design` (design tokens / design system false positives); keep `design the/a…`, `api design`, brainstorm/architect
- **test** sync promote / no-reopen / PostTool write path; design negative matrix

## [1.1.19] — 2026-07-16

### MAGI spiral — todo complete signal + blocked status (omo #4111 / #1775)

- **fix(isTodoOpenStatus)** treat `blocked` / `deferred` / `waiting` / `on_hold` / `paused` as closed — no continuation loop when work waits on human (omo [#1775](https://github.com/code-yeongyu/oh-my-openagent/issues/1775))
- **feat(Stop)** one-shot `ALL_TODOS_COMPLETE` when mirror has only closed todos and reply is idle — ask for user summary instead of silent freeze (omo [#4111](https://github.com/code-yeongyu/oh-my-openagent/issues/4111)); substantial wrap-up marks signaled without re-block
- **test** status matrix + complete-signal once + Stop path

## [1.1.18] — 2026-07-16

### MAGI spiral — plan checkbox hygiene + start-work todos (omo #6066)

- **fix(hasOpenPlanCheckboxes)** only labeled open tasks outside `## Review`; ignore empty `- [ ]` placeholders and Review rows so boulder is not stuck forever after VERDICT:PASS
- **feat(start-work)** seed session todos from plan task rows when mirror empty (omo [#6066](https://github.com/code-yeongyu/oh-my-openagent/issues/6066) Goal-like continuation)
- **refactor** shared `parsePlanTaskCheckboxes` / `seedTodosFromPlanIfEmpty` used by prometheus count + stop gate
- **test** empty-placeholder null; Review skip; seed once / no overwrite

## [1.1.17] — 2026-07-16

### MAGI spiral — omo issue parity (skill false positives + plan format)

Benchmarked against [code-yeongyu/oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) issues:

- **fix(skill-gate)** INTENT rules: drop bare `tests?` / `plan` / `loop` (omo [#3312](https://github.com/code-yeongyu/oh-my-openagent/issues/3312) class false positives). Keep strong phrases: `TDD`, `unit tests`, `write/run tests`, `draft a plan`, `plan the …`, `ulw`/`ralph`/`ultrawork`
- **feat(prometheus)** `/start-work` requires ≥1 labeled task checkbox outside `## Review` (omo [#6094](https://github.com/code-yeongyu/oh-my-openagent/issues/6094) prose-only Todos → 0/0 boulder). Empty `- [ ]` placeholders do not count
- **test** skill negative matrix; `countPlanTaskCheckboxes` + PLAN_FORMAT deny path

## [1.1.16] — 2026-07-16

### MAGI spiral — skill-gate path false positives

- **fix(skillGateContext)** only include **test-like** file paths (`.test.` / `.spec.` / `__tests__` / `/test/`) — stop treating `plan_executor.ts` / arbitrary paths as plan/test intent
- **test** non-test path ignored; test path still drives TDD suggestion

## [1.1.15] — 2026-07-16

### MAGI spiral — DONE hedges + empty Write wipe

- **fix(isDoneMessage)** reject partial DONE claims (`ULW_DONE except…`, `almost RALPH_DONE`, Chinese 未/还没 near markers) — same lineage as verify-gate v1.1.14
- **fix(hashline)** deny **Write/Create with empty contents** on an existing file (accidental wipe)
- **test** DONE hedge matrix; empty Write wipe vs non-empty allow

## [1.1.14] — 2026-07-16

### MAGI spiral — verify-gate hedge + Chinese pass

- **fix(isVerifiedMessage)** reject `all tests passed except/but/however/failed` and `almost/mostly all tests passed` (partial-success false verify)
- **feat** accept Chinese `全部测试通过` / `所有测试已通过` with negation denylist
- **test** hedge matrix + Chinese true/false

## [1.1.13] — 2026-07-16

### MAGI spiral — empty old_string + idle Chinese fluff

- **fix(hashline)** deny **empty `old_string`** when target file already exists (Grok empty-old creates files only)
- **feat(idle)** detect Chinese status fluff (`稍等` / `稍后继续` / …); idle reason lists `task` / `get_task_output`
- **docs** agent-guard deny text uses Grok tool names
- **test** empty-old existing vs new path; Chinese idle matrix

## [1.1.12] — 2026-07-16

### MAGI spiral — Grok-native tool names + NotebookEdit

- **fix(isMutatingTool)** recognize **NotebookEdit** (letter order ≠ EditNotebook)
- **hooks** PreTool matcher add `notebook_edit`
- **docs/agents** Sisyphus bootstrap + agents/rules prefer host **`task`** + **`get_task_output`** (Grok native); soft absolute “never stop” wording (omo #6129 direction)
- category-discipline / spawn follow-through How-to-fix use `task` language

## [1.1.11] — 2026-07-16

### MAGI spiral — omo issue parity (todo continuation config + stagnation)

Benchmarked against [code-yeongyu/oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) issues:

- **#6133** Make todo-continuation timing configurable → `todoAbortWindowMs` / `todoMaxContinues` / `todoMaxStagnation` in `.omg/config.json` + env
- **omo constants** `MAX_STAGNATION_COUNT=3` → stop re-yanking when open-todo fingerprint unchanged for N continues (circuit open even on idle)
- **#6001** tool-output skill pollution → Grok host discards non-PreTool stdout (already immune); documented in omo-gap
- Defaults unchanged: cooldown 5s, abort window 3s, max continues 20, max stagnation 3

## [1.1.10] — 2026-07-16

### MAGI spiral — Hashline accepts Grok read_file prefixes

- **fix(hashline)** `stripHashlinePrefixes` also strips Grok `read_file` display format `N→line` before old_string disk match
- Prevents false "stale edit" when agents paste tool output into `search_replace.old_string`
- **test** strip unit + allow-with-prefix + still-deny-wrong-body

## [1.1.9] — 2026-07-16

### MAGI spiral — todo_write merge semantics

- **fix(todo)** Grok `todo_write` defaults **merge=true**; PostTool no longer full-replaces mirror with partial patches
- **fix** status-only updates keep prior content; other todos preserved
- **fix** enforcer reset only when **all** mirrored todos are closed (not just the update batch)
- **test** merge / replace / PostTool enforcer path

## [1.1.8] — 2026-07-16

### MAGI spiral — Grok native recovery + host plan mode tools

- **fix(isResultRecoveryTool)** match `task_output` / `wait_tasks` / `get_terminal_command_output` / `*subagentoutput*` (not only get_task_output prefix)
- **hooks** PostTool spawn matcher expands recovery tool exact names
- **feat** `enter_plan_mode` / `exit_plan_mode` PostTool → `activateHostPlanMode` / `endPlanMode` so PreTool plan-mode gate arms with host tools
- **test** recovery aliases; host enter→deny Write→exit→allow

## [1.1.7] — 2026-07-16

### MAGI spiral — hooks exact names + comment/spawn tool norm

- **hooks** PreTool/PostTool matchers add **SearchReplace**, search-replace, MultiEdit, apply-patch, Delete(File), ReadFile (host simple matcher is **exact / case-sensitive**)
- **fix(comment-checker)** PreDeny scans SearchReplace/apply_patch via `normalizeToolName` (was miss CamelCase)
- **fix(isSpawnTool)** letters-only so spawn-subagent matches
- **validate** requires SearchReplace + search_replace in PreTool matcher
- **test** SearchReplace hard deny; spawn-subagent

## [1.1.6] — 2026-07-16

### MAGI spiral — Hashline isReplace for SearchReplace

- **fix(hashline)** replace-branch detection uses `normalizeToolName` so **SearchReplace** / `search-replace` run `old_string` + LINE#ID checks (previously only `search_replace` underscore form matched)
- **test** SearchReplace stale old_string deny; search-replace exact allow

## [1.1.5] — 2026-07-16

### MAGI spiral — mutating-tool norm + diag PreTool hard fail

- **fix(isMutatingTool)** normalize to `[a-z]` only so **SearchReplace** / `search-replace` match (old `[^a-z_]` kept underscores → `searchreplace` missed set)
- **feat(diag)** `diagPreDeny`: when `lastErrors` set (failed diagCommand), PreTool denies mutating tools until clean; soft `needsVerify` stays Stop-only
- PreTool order: … spawn-followthrough → **diag** → hashline …
- **test** SearchReplace/search-replace; diag PreTool deny + soft null

## [1.1.4] — 2026-07-16

### MAGI spiral — spawn follow-through PreTool (after child finished)

- **feat** `spawnFollowThroughPreDeny`: when **childFinished + pending**, first mutating tool → PreTool deny once (host-enforced)
- Parallel parent edits **while child still running** remain allowed (`pending` without `childFinished`)
- PreTool order: … category-discipline → **spawn-followthrough** → hashline …
- **test** allow-while-running / deny-once-after-End / production PreTool path

## [1.1.3] — 2026-07-16

### MAGI spiral — SubagentEnd must not clear follow-through

- **fix(spawn-followthrough)** host **SubagentEnd** no longer clears pending: child finished ≠ parent integrated
- **feat** `markSubagentChildFinished` keeps/re-arms pending + `childFinished` flag for yank copy
- Clear paths remain: `get_task_output` / inline spawn result / recovered or progress Stop language
- **test** End keeps pending; End-alone arms; get_task_output still clears after End

## [1.1.2] — 2026-07-16

### MAGI spiral — category discipline on PreTool (host-enforced)

- **feat(category-discipline)** first mutating tool on specialist category (deep / visual / ultrabrain) + zero spawns → **PreTool deny once** (Grok only enforces PreToolUse)
- Shared once flag with Stop path (no double-yank); spawn / SubagentStart still clears via `markSpawnActivity`
- PreTool order: agent-guard → plan-mode → **category-discipline** → hashline → comment → skill-gate
- **test** PreTool production path + shared once with Stop

## [1.1.1] — 2026-07-16

### MAGI spiral — parent session sticky poison fix

- **fix(agent-guard)** PostTool `spawn_subagent` / host **SubagentStart** no longer sticky-lock parent session to child role (`explore`/`oracle`/…)
- Root cause (grok-build `updates.rs`): SubagentStart/PostTool spawn fire on **parent** session; sticky child role → parent Write denied by AGENT_GUARD when host omits `agentName`
- Sticky role sources remain: `/agent`, host `agentName` on UserPrompt/tools
- Spawn still arms follow-through + category spawn mark; SubagentEnd still clears pending
- **test** agent-guard / omo-gap-v07 / spawn-followthrough inverted expectations

## [1.1.0] — 2026-07-16

### Source-aligned with xai-org/grok-build

Based on open-source `xai-grok-hooks` + plugin `hooks_adapter` (see `docs/grok-build-source.md`).

- **feat(hooks)** register host **`SubagentStart` / `SubagentEnd`** → arm / clear spawn follow-through (prefer host lifecycle over assistant prose)
- **feat(parse)** coerce Grok **`toolResult`** (string|object) → `toolOutput`; expose `subagentType`
- **docs(contract)** truth table: only **PreToolUse** is host-enforced; non-blocking stdout discarded
- **test** protocol `toolResult` / `subagentType`; SubagentStart→arm / SubagentEnd→clear; cli e2e lifecycle
- Note: plugin loader skips `SubagentStop` — use **`SubagentEnd`** only

## [1.0.2] — 2026-07-15

### MAGI spiral

- **feat(spawn-followthrough)** `get_task_output` / `get_command_or_subagent_output` PostTool → **clear pending**（工具路径结果回收）
- **feat** 同步 spawn 若 `toolOutput` 已是实质结果 → 不 arm follow-through
- **hooks** matcher 注册上述 recovery 工具名
- **test** +3 it；483 passed

## [1.0.1] — 2026-07-15

### MAGI post-1.0 spiral

- **fix(todo-boulder)** `hasOpenPlanCheckboxes` 优先检查 active `boulder.planPath`（含 plansDir 外路径）并去重
- **feat(session-resume)** boulder 活跃且 plan 仍有开项 checkbox 时摘要提示
- **docs** omo-gap 清理过时 babysitter 条目；README.en 对齐 1.0 Hashline / resume

## [1.0.0] — 2026-07-15

### Stable baseline (P0 + P1 + P2 → 1.0)

Grok-feasible harness 契约冻结：之后 breaking 走 2.0 / 迁移说明。

#### P0 — Hashline
- deny 文案补「How to fix」+ Read / hashline-edit skill
- hooks matcher 扩：`search_replace`、`WriteFile`、`EditFile`、`read_file` 等
- `isMutatingTool` 对齐 apply-patch / search_replace / WriteFile
- README「Hashline 怎么用」+ skill 更新

#### P1 — Spawn 结果回收
- follow-through 每 wave **最多 2 次** Stop yank（`SPAWN_FOLLOWTHROUGH_MAX_YANKS`）
- 第二次强调 `get_task_output` / 整合发现
- `isSpawnResultRecoveredMessage` 识别结果回收话术并清 pending

#### P2 — SessionStart 状态摘要
- `sessionResumeSummary`：活跃 ULW/Ralph、boulder、未完成 todos、handoff 路径
- 注入 `<OMG_SESSION_RESUME>`（非全量 project-memory）

#### Non-goals unchanged
Team Mode / multi-provider / in-plugin LSP suite — still out of scope.

## [0.30.1] — 2026-07-15

### Acceptance

- **test(protocol):** beforeEach 清空 GROK_* env，避免宿主/验收脚本污染导致 `workspaceRoot` 误用 `GROK_WORKSPACE_ROOT`
- **docs:** `docs/acceptance-report-0.30.md` — 自动化验收 24/24 主路径 PASS

## [0.30.0] — 2026-07-15

### MAGI spiral (审视→执行→提升)

- **审视:** `/handoff` 写 stub 后新 session 不自动续跑，需用户手动 @ 文件
- **执行:**
  - **feat(handoff)** `findLatestHandoff` + `resumeFromHandoffContext`
  - **feat(session-start)** 有 handoff 时注入 `OMG_HANDOFF_RESUME` 摘要
  - handoff 测试 +4 it
- **提升:** 验收用 docs/acceptance.md；下一轮反馈驱动

## [0.29.0] — 2026-07-15

### MAGI spiral (审视→执行→提升)

- **审视:** 功能/测试已厚，验收缺少可勾选路径
- **执行:** `docs/acceptance.md` 安装→规划→循环→角色/spawn→Hashline/注释→命令 摸测清单
- **提升:** 等验收反馈驱动 v0.30+；project-memory 仍 defer

## [0.28.0] — 2026-07-15

### MAGI spiral (审视→执行→提升)

- **审视:** cli fail-open 仅源码注释，无子进程 e2e
- **执行:** `tests/cli-failopen.test.ts` 6 it：未知 event exit 0、空 stdin session-start、畸形 JSON、pre-tool allow、user-prompt 注入
- **提升:** 下一螺旋可选 project-memory lite 或验收反馈

## [0.27.0] — 2026-07-15

### MAGI spiral (审视→执行→提升)

- **审视:** `parseHookInput` 仅 2 it，畸形 tool_input / env 回填 / agent 别名零专属锁定
- **执行:** `tests/protocol.test.ts` 扩到 11 it：JSON 失败→`{raw}`、array 忽略、env session/workspace、agent/stop/firstPrompt/toolOutput 别名
- **提升:** 下一螺旋 project-memory lite 再评估，或 cli fail-open e2e

## [0.26.0] — 2026-07-15

### MAGI spiral (审视→执行→提升) · 连续两轮

**v0.25 session-start / rules**
- **fix** fingerprint 硬编码 `0.16.0` → `readPluginVersion(package.json)`
- **fix** 首轮 alive `v0.2` → 真实版本
- **feat(session-start)** 启动注入 `loadInjectedRules`
- **fix(rules)** code-point 截断；bootstrap 分类补 unspecified-*
- `tests/session-start.test.ts` 11 it

**v0.26 orchestration + session-end**
- `tests/orchestration-session-end.test.ts`：hard-orchestration 注入开关、comment hint、session-end 重置 promptCount
- **提升:** 下一螺旋 protocol/parse 硬化或 project-memory 再评估

## [0.24.0] — 2026-07-15

### MAGI spiral (审视→执行→提升)

- **审视:** `/init-deep` 中间目录仅向下看一层 `hasCodeFiles`，`a/b/c/d.ts` 时 `a/` 不生成 AGENTS.md
- **执行:**
  - **fix(init-deep)** `hasCodeFilesDeep` 有界递归，中间包路径也能生成 stub
  - `tests/init-deep.test.ts` 9 it：detect/opts/code dirs/skip vendor/maxDepth/手写保留
- **提升:** 下一螺旋 session-start / rules 注入，或 project-memory 再评估

## [0.23.0] — 2026-07-15

### MAGI spiral (审视→执行→提升)

- **审视:** intent-gate `\bulw\b` 误吃 `ulw-stop`；category 中文用 `\b` 对 CJK 永不匹配；`unspecified-low` 有文案无路径
- **执行:**
  - **fix(intent)** ulw 连字符拒绝；search→debug→analyze 优先级；中文 查找/调试/分析
  - **fix(category)** 中文模式去掉 `\b`；激活 unspecified-low（tweak/微调）
  - `tests/intent-category.test.ts` 18 it
- **运维:** MAGI 定时 4h → **30m**
- **提升:** 下一螺旋 handoff / init-deep 专属或 skill-gate 生产路径硬化

## [0.22.0] — 2026-07-15

### MAGI spiral (审视→执行→提升)

- **审视:** comment-checker 仅 magi-v09 / functional 切片；findCommentSlop 真值表与 aggregate 阈值未专属锁定
- **执行:** `tests/comment-checker.test.ts`（12 it）：EN/ZH/emoji/narration 正例、意图注释负例、阈值 3 次 yank、deny 模式、PostTool record
- **提升:** 下一螺旋可静置等验收反馈，或挑 project-memory / hashline native 缺口

## [0.21.0] — 2026-07-15

### MAGI spiral (审视→执行→提升)

- **审视:** category-discipline 只惩罚零 spawn；spawn 后父会话以 idle/「已派出」收工无再拉
- **执行:**
  - **feat** `spawn-followthrough.ts`：PostTool spawn 武装 pending；Stop 遇 idle 或 spawn-announce 则 block 一次；有路径/test 证据的实质进展清 pending
  - wire stop 2.6 + post-tool-spawn；contract Stop order +2.6
  - `tests/spawn-followthrough.test.ts`（8 it）
- **提升:** 下一螺旋 README 能力表同步 + 可选 project-memory 再评估

## [0.20.0] — 2026-07-15

### MAGI spiral (审视→执行→提升)

- **审视:** idle-turn / think-mode 仅 omo-gap-v07 薄切片，fluff 真值表与 UserPrompt 注入边界未专属锁定
- **执行:** `tests/idle-think.test.ts`（18 it）：idle 空/短/中英 fluff/deferral/emoji/短状态 vs 有路径证据；think 英/中正例 + casual think 负例；Stop todos/ULW 联动 + UserPrompt THINK_MODE 注入
- **提升:** 下一螺旋优先 background spawn follow-through（Stop 再拉）

## [0.19.0] — 2026-07-15

### MAGI spiral (审视→执行→提升)

- **审视:** PreTool 第一道 agent-guard 仅 omo-gap-v07 / orchestration 切片覆盖；session-role sticky 优先级契约未专属锁定
- **执行:** `tests/agent-guard.test.ts`（27 it）：READ_ONLY 全集 / resolveAgentRole 别名+env+slash 优先 / agentGuardDeny 真值表 / detectAgentCommand·extractSpawnRole·isSpawnTool / UserPrompt+PostTool+PreTool 生产路径
- **契约锁定:** slash-agent sticky 压过 host agentName；spawn sticky 仅在 host 省略 agentName 时生效
- **提升:** 下一螺旋优先 idle-turn / think-mode 专属深化，或 background babysitter Stop 再拉

## [0.18.0] — 2026-07-15

### MAGI spiral (审视→执行→提升)

- **审视:** v0.15 契约锁定三缺陷会误解析 goal / 误启 ULW / 假验证
- **执行:**
  - **fix(ralph)** `parseGoalsFromTask`：尾分号/竖线剥离；数字目标单字符（`1) a 2) b`）可拆
  - **fix(ralph)** `detectRalphCommand`：`ulw-stop` 等连字符不再误启；保留 CJK 粘连 `ulw重构`
  - **fix(ralph)** `isVerifyShellCommand`：按 `&&/||/;` 分段，拒绝 echo/printf/Write-Host 段
  - 测试：ralph 专属 67 it（+4）
- **提升:** 下一螺旋优先 background babysitter 深化，或 agent-guard / session-role 专属测试

## [0.17.0] — 2026-07-15

### MAGI spiral (审视→执行→提升)

- **审视:** plan-review 门禁仅有 magi-spiral-v09 四路径覆盖；`planFileHasReview` 列表符 `+` 与 `hasOpenPlanCheckboxes` 不一致
- **执行:**
  - `tests/prometheus.test.ts` 专属 30 it：detectPlanCommand / planFileHasReview 真值表 / startWorkFromPlan 失败矩阵 / planModeDeny / UserPrompt+PreTool 生产路径
  - **fix(prometheus):** 已勾选与未勾选 checklist 支持 GFM `+` 列表符（对齐 todo-boulder）
- **提升:** 下一螺旋优先 v0.15 契约锁定缺陷修复（parseGoals 尾分号/单字符数字目标、detectRalph 连字符、isVerifyShell echo 边界）

## [0.16.0] — 2026-07-14

### MAGI spiral (审视→执行→提升)

- **审视:** CATEGORY_DISCIPLINE 已在 v0.10 shipped；下一缺口为 todo-boulder 仅间接覆盖
- **执行:** `tests/todo-boulder.test.ts` 专属 13 it；收紧 `isAbortLikeStopReason`；加固 plan checkbox 开项检测
- **提升:** 下一螺旋优先 prometheus plan-review 专属测试深化

## [0.15.0] — 2026-07-15
### MAGI 螺旋8 · isDoneMessage 否定漏网续修(连续第三同源 bug)+ ralph.ts 专属测试
- **fix(ralph)** — isDoneMessage 用 `msg.includes(m)` 纯子串匹配 DONE_MARKERS(含 RALPH_DONE/ULW_DONE 裸标记无锚定),零否定集。processLoopStop 在 ralph 模式对命中直接 cancelRalph 不经 gate,故 `'not ULW_DONE'`/`'NOT <promise>DONE</promise>'`/`'will never mark RALPH_DONE'`/`'no ULW_DONE yet'` 等否定话术立即关闭活跃 loop。补 NEGATED_DONE 否定集(对齐 isVerifiedMessage v0.13/v0.14 修复模式)——**连续三轮同源 bug**(v0.13/v0.14 isVerifiedMessage + v0.15 isDoneMessage)。
- **fix(ralph)** — applyGoalDoneMarkers 双向 includes(`g.text.includes(mk) || mk.includes(g.text)`)过宽:单字符 marker `'GOAL_DONE: a'` 误标多 goal 完成,绕过 ulwDoneGate multi-goal gate。删反向 `mk.includes(g.text)` + 超短 marker(<=3 字符)仅精确相等。
- **test(ralph)** — 新增 tests/ralph.test.ts(63 it,10 describe):isDoneMessage 真值表(含否定集)/parseGoalsFromTask/applyGoalDoneMarkers/isVerifyShellCommand/phase 谓词状态机/detectRalphCommand/processLoopStop 四分支/ulwDoneGate problems/multi-goal DONE/noteUlwShell 联动。ralph.ts 695 行最大模块此前零专属测试。
- **契约锁定(未修 src,防范围蔓延)** — parseGoalsFromTask 尾分号/数字单字符吞并、detectRalphCommand 连字符残留、isVerifyShellCommand echo 边界,以当前行为契约锁定,留待后续。

## [0.14.0] — 2026-07-15
### MAGI 螺旋7 · verify-gate 否定检测续修 + pre-tool/stop 编排测试
- **fix(diagnostics)** — isVerifiedMessage v0.13 黑名单仅含 not/never/without/didn't/haven't/hasn't,漏网 don't/isn't/aren't/wasn't/weren't/won't/doesn't/couldn't/shouldn't/wouldn't/mustn't/hadn't/ain't 等缩写与 rarely/hardly/barely/scarcely/seldom 频度否定 → 全部误判已验证、绕过 verify-gate(5 调用点:stop markVerified / boulder clear / ralph ulwDoneGate / markVerifyReached / diag 软提醒)。补全完整否定集(不含 no,避免误拒合法 'no issue, all tests passed')。
- **test(diagnostics)** — truth-table 扩展:缩写否定(16 词)/频度否定(5 词)/非缩写(3 条)用例,锁 v0.13 漏网回归。
- **test(pre-tool-orchestration)** — 新增 tests/pre-tool-orchestration.test.ts(11 it):锁 pre-tool-use 5 门禁顺序(agent-guard→mutating 短路→plan-mode→hashline→comment-checker→skill-gate)的双重断言 + 非 mutating 短路 + fail-open + 文案。此前编排顺序零专属覆盖。
- **test(stop-orchestration)** — 新增 tests/stop-orchestration.test.ts(9 it):锁 stop 7 段优先级(isStopPaused→ralph→boulder→catDisc 2.5→todos→diag→plan→comment)+ diag soft-verify 一次窗口 + ralph/catDisc 每会话至多一次副作用。
- **关键纠偏** — agent-guard.ts:92 对非 mutating 工具首行 return null,故 oracle 的 Read 直接 allow(非被拦);编排测试锁定真实行为而非 false-pass 假设。

## [0.13.0] — 2026-07-15
### MAGI 螺旋6 · verify-gate 误放行修复 + diagnostics/hashline 测试深化 + 文档一致性
- **fix(diagnostics)** — `isVerifiedMessage` 的 `/all tests passed/i` 子串无锚定,`'not all tests passed'` / 否定句误判已验证、绕过 verify-gate(被 stop.ts 入口 markVerified + ralph DONE 接受)。收紧为 `\ball tests passed\b` + 否定语境排除(not/never/without/n't 前导),保留合法肯定陈述。
- **test(diagnostics)** — 新增 tests/diagnostics.test.ts(12 it):isVerifiedMessage 真值表(正例+负例锁 verify-gate)、diagStopReason 三分支、runDiagCommand 状态分支。diagnostics.ts 此前零专属测试。
- **test(hashline)** — tests/hashline.test.ts 追加 7 it:LINE#ID 四拒绝分支(unknown/mismatch/body-mismatch/anchors-without-cache)+ 正例 + TTL + empty old_string,替换 functional-gates 过宽断言。
- **docs** — omo-gap L34/L39/L93 pi-ast-grep 残留(pi agent 专用,与螺旋5 矛盾)→ ast-grep-skill;inventory Hashline/Context7 状态对齐 v0.12;contract.md Env 补 OMG_DIAG_TIMEOUT_MS / OMG_HASHLINE_TTL_MS / OMG_TODO_ABORT_WINDOW_MS。
- **docs(omo-gap)** — 候选B project memory 裁定 defer(CATEGORY_DISCIPLINE 上线仅 ~15h、前置未满足,叠历史层会放大调试面);设 v0.14 焦点 = 事件编排测试(pre-tool/stop 门禁顺序锁定)。

## [0.12.0] — 2026-07-15
### MAGI 螺旋5 · README 分发渠道 + 分级 MCP + hashline 加固
- **docs(README)** — README/README.en 新增「分发渠道」小节:GitHub 直装(主路径,`--trust`)+ 官方 marketplace 教育引导(`/plugin` 浏览 + commit-SHA pin 信任链);明确「暂未收录,用 GitHub 直装」,不写已上架。
- **docs(README)** — 新增「可选增强(MCP)」分级:context7(已随 `.mcp.json` shipped,无需配置,中英同步)/ lsp-tools-mcp + ast-grep-skill(omo 作者外部 MCP,标注非 Grok 原生 + Windows #4262 警示)。
- **fix(marketing)** — 修正 omo-gap 原文把 pi-ast-grep(pi coding agent 专用,非 Grok)当推荐 MCP 的虚假宣传风险 → 移除 pi-ast-grep,改推同作者通用 ast-grep-skill(审视脑 fan-out 4 维度独立确认 high severity)。
- **test(hashline)** — 新增 `tests/hashline.test.ts`:跨风格路径收敛 / stale-cache 拒绝 / post-write recache 三条零覆盖分支。hashline.ts 300+ 行核心「先读后改」门禁此前无专属测试。
- **chore(hashline)** — `resolvePath` 用 `path.resolve` 替代 `path.join`+`path.normalize`(预防性硬化,非 bugfix;多参数等价 normalize(join),测试验证收敛语义不回归)。
- **docs(omo-gap)** — 关闭候选A(v0.12),设 v0.13 焦点 = 候选B(project memory 持久层);owner Kyou12138 经 git remote 核实(mihazs 嫌疑为搜索混淆)。

## [0.11.0] — 2026-07-14
### MAGI spiral 4 · nested-AGENTS 加厚(realpath 容器 + code-point 安全截断)
- **feat(directory-inject)** — realpath 容器:`safeRealpath`+`isInside` 用 `fs.realpathSync.native` 解析规范路径后再做 containment 比较,堵住 symlink 下 lexical `path.relative` 误判(外部 AGENTS.md 经符号链接泄漏 / 容器内路径被误判越界);不存在路径/symlink 环自动回退 `path.normalize`
- **feat(directory-inject)** — code-point 安全截断:`truncateByCodePoints`(ASCII fast-path + `Array.from`)替换 per-file `slice(0,2000)` 与 MAX `slice(0,6000)`,防 CJK/emoji 被截成 lone surrogate 破坏 UTF-8/JSON
- **test** — code-point 截断新增 CJK well-formed 断言;realpath symlink 容器保留 skip(Windows symlink 需管理员/开发者模式,手动 / Linux CI 验证)
- 对齐 omo pi-nested-agents-md 的 realpath-based root containment + code-point-safe truncation

## [0.10.1] — 2026-07-14
### MAGI spiral 3 · 测试加固 + containment 修复
- **test** — 补齐三处零覆盖基础设施:tests/config.test.ts (19 it: env开关/envNum边界/文件overlay/stateDir/pluginData回退/categoryDiscipline)、tests/skill-gate.test.ts (47 it: INTENT_SKILL_RULES 全 8 条规则 + 门控判定/catalog/e2e)、tests/directory-inject.test.ts (7 it + 2 v0.11 baseline skip)
- **fix(directory-inject)** — root containment 检查前移到 AGENTS.md 读取之前,堵住"filePath 逃逸 workspace 时仍读外部 AGENTS.md"的泄漏缺陷(测试驱动发现);realpath/symlink 安全仍留 v0.11
- 累计 195 测试(192 pass + 2 v0.11 baseline skip)

## [0.10.0] — 2026-07-14
### MAGI spiral 2 · CATEGORY_DISCIPLINE 门禁
- **feat(stop)** — 新增 src/features/category-discipline.ts:deep/visual-engineering/ultrabrain 工作且本会话零 spawn_subagent 时 Stop block 一次,reason 列出推荐 subagent(explore/hephaestus/oracle);首次 spawn 后清除标记;每会话至多一次。
- **feat(config)** — OMG_CATEGORY_DISCIPLINE 开关(默认开);新状态文件 category-discipline.json(session 级)。
- **wire** — stop.ts 插入第 2.5 gate(Boulder 后 Todos 前);post-tool.ts handlePostToolSpawn 接 markSpawnActivity。
- **test** — tests/category-discipline.test.ts 覆盖 8 场景。
- **docs** — contract Stop order +2.5;omo-gap 关闭 Category spawn discipline gap。

## [0.9.1] — 2026-07-14

### MAGI spiral 1 · 审视 → 执行 → 提升（自主螺旋）

- **fix(security)** — `hooks/hooks.json` PreToolUse + PostToolWrite matcher 补 `Create|Apply_patch|Multiedit`，与 `skill-gate.ts` 的 MUTATING 集合对齐；堵住这三个变异工具静默绕过 PreTool 全部门禁（Agent Guard / plan-mode / Hashline / Comment Checker / Skill Gate）及 PostTool-write 后处理（markDirty / noteUlwWrite / Hashline 缓存 / commentCheckerPostWarn）的安全缺口
- **docs(omo-gap)** — 基于 Grok Build 2026 平台事实重判三项 `blocked → partial`：In-plugin LSP/AST（可接入 omo 作者 `lsp-tools-mcp` / `pi-ast-grep` stdio server）、Built-in Exa/Context7 MCP（平台原生 MCP）、Background agent babysitter（`spawn_subagent` 已支持 8 并发，matcher 已注册，仅缺 Stop 门禁 → 并入 v0.10）。区分 "Full suite（放弃）" 与 "接入既有 MCP server（可选增强）"
- **docs(contract)** — Stop order 补第 6 步 `Comment slop aggregate (soft, once per session)`，对齐 `stop.ts` 的 `commentAggregateStopReason` 实现
- **chore(mcp)** — `.mcp.json` 启用 context7（`disabled: false`）
- **test** — `tests/handoff.test.ts` 新增 4 describe / 10 it（原零覆盖）：detect / writeStub / context / dir 隔离
- **audit** — 审视脑 fan-out 46 条发现 → Metis 去重 35 条，锁定 matcher 漏洞为最高危；识别 3 处文档自相矛盾（non-goal vs blocked 语义重叠）

### Next spiral (v0.10) focus

**CATEGORY_DISCIPLINE 门禁** — `deep / visual-engineering / ultrabrain` 任务且 spawn 活动为零时 Stop block 一次，列出推荐 subagent。插入点 `stop.ts` Boulder 与 Todos 之间（审视脑已确认）。

## [0.9.0] — 2026-07-11

### MAGI spiral (审视→执行→提升)

- **Plan-review gate** — `/start-work` requires ## Review checked item or Metis/Momus `VERDICT: PASS` in plan markdown
- **Comment aggregate** — stronger slop patterns (Implements/Handles/中文重述); session hit count ≥3 → one Stop `COMMENT_AGGREGATE`
- **Next spiral focus:** Category spawn discipline on Stop when deep/visual work never spawned specialists

## [0.8.0] — 2026-07-11

### Functional (omo-gap remaining)

- **Multi-goal ULW** — parse goals from `a; b; c` / `a | b` / numbered lists; Stop shows checklist; `GOAL_DONE: …` marks complete; DONE gate requires all goals done
- **Todo Enforcer abort-window** — `OMG_TODO_ABORT_WINDOW_MS` now wired: abort/error stop reasons re-yank despite cooldown
- Inventory `docs/omo-gap.md` updated (remaining: category→model, native Hashline tool, …)

## [0.7.0] — 2026-07-11

### Functional (omo-gap close)

- **Think-mode** — `ultrathink` / `think deeply` / `仔细想` injects extended-effort protocol on UserPrompt
- **Sticky session agent role** — `/agent <role>`, spawn_subagent/Task PostTool, host agentName → session role; Agent Guard uses sticky role when later tools omit agentName
- **Idle-turn Stop yank** — empty/fluff assistant replies cannot soft-stop open todos / ULW; reason includes `IDLE TURN DETECTED`
- **Inventory** — `docs/omo-gap.md` (shipped / partial / blocked vs omo)

## [0.6.0] — 2026-07-11

### Functional (ULW + Skill Gate)

- **ULW shell activity** — PostTool `Bash|Shell|run_terminal_command|…` via `post-tool-shell`; `noteUlwShell` increments activity; **test/lint/typecheck** commands auto-mark ULW **verify** phase
- **Intent-aware Skill Gate** — matches last prompt + loop task + file path to suggested skills (TDD, debug, plan, ulw, …); mutation denied until a **relevant** skill is Read (not any random skill)
- Last prompt persisted for gate context (`last-prompt.json`)

## [0.5.0] — 2026-07-11

### Functional harness upgrades (star-ready via capability)

- **Hashline LINE#ID hardened** — tag mismatch, unknown line, **body mismatch** (tag OK but line text differs), stale `old_string`, write-without-Read all deny on PreTool
- **Boulder lifecycle** — Stop blocks with plan checkbox context; DONE/VERIFIED clears boulder when checkboxes complete; **`/cancel-boulder`**
- **Agent Guard fail-open** — no role → allow (main session); role present → hard deny for read-only agents
- **Comment Checker** — soft PostTool warn + optional hard PreTool deny
- **Functional gate suite** — `tests/functional-gates.test.ts` drives real handlers + `dist/cli.js` stdin path

## [0.4.0] — 2026-07-11

### Added

- **Agent Guard** — hard-deny Write/Edit/Delete for read-only roles (`oracle`, `explore`, `librarian`, `metis`, `momus`)
- **Comment Checker** — detect AI-slop narration comments; soft warn by default, optional hard deny
- **Category thin layer** — visual / deep / ultrabrain / quick / writing banners for delegation guidance
- **`/init-deep`** — hierarchical `AGENTS.md` generation + skill
- **Metis / Momus** agents — plan gap analysis and plan review (read-only)
- **Hashline PostTool inject** — LINE#ID annotated preview after Read; nearby AGENTS.md directory inject
- **`npm run doctor`** — health check for hooks, agents, skills, dist
- Plan-mode copy requires Metis → Momus review chain before `/start-work`

### Changed

- PreTool order: Agent Guard → plan-mode → Hashline → Comment Checker → Skill Gate
- Hard orchestration banner and Sisyphus bootstrap list Metis/Momus and categories
- Plugin/package version **0.4.0**

### Docs / OSS

- Star-ready README (problem → install → wow path → honest omo comparison)
- CONTRIBUTING, CHANGELOG
- Documented CI: `npm run ci` (`scripts/ci.mjs`) + Actions template `docs/ci.workflow.yml`

## [0.3.0] — 2026-07-11

### Added

- **ULW v2** — mid-sentence `ulw`/`ultrawork`, phase machine explore→implement→verify, DONE evidence gate, stall detection, progress logs under `.omg/ulw-loop/`
- Discipline agents (Sisyphus team) as plugin agents
- Hashline PreTool guard (fresh Read, stale `old_string`, LINE#ID validation)
- Diagnostics soft/hard stop, hard orchestration injection
- Superpowers vendor + Skill Gate catalog over plugin + vendor skills

### Harness spine (earlier)

- Ralph loop, Todo mirror + enforcer, Boulder, Prometheus plan-mode, IntentGate, Handoff, rules injection, fail-open CLI

## [0.2.x] / earlier

Internal scaffolding: protocol golden tests, SessionStart fingerprint, UserPrompt merge, Windows `node dist/cli.js` entry.
