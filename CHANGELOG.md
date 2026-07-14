# Changelog

All notable changes to this project are documented here.

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
