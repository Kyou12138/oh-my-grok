# oh-my-grok vs oh-my-openagent (omo) — capability inventory

**Date:** 2026-07-14 · **omg version:** 0.10.x  
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
| Hashline LINE#ID | PreTool tag+body + Read inject | **partial** |
| Skill force-use | Intent Skill Gate | **shipped** |
| Comment checker | patterns + **session aggregate Stop** | **shipped** (partial vs binary) |
| Discipline agents + role lock | sticky /agent + spawn | **shipped** (partial models) |
| Idle-turn yank | fluff empty Stop | **shipped** |
| Team Mode / tmux | — | **blocked** |
| Multi-provider model matrix | — | **blocked** |
| In-plugin LSP / AST | — | **partial** |
| Built-in Exa/Context7 MCP | — | **partial** |

## Reassessed this spiral (v0.9.1)

Platform facts: Grok Build now supports native MCP servers, `spawn_subagent` (up to 8 concurrent, each with independent context window), and an official plugin marketplace (github.com/xai-org/plugin-marketplace). omo author code-yeongyu has split LSP/AST into reusable stdio MCP servers: code-yeongyu/lsp-tools-mcp and code-yeongyu/pi-ast-grep.

| Item | Old tag | New tag | Basis |
|------|---------|---------|-------|
| Built-in Exa/Context7 MCP | blocked | **partial** | Platform supports native MCP; `.mcp.json` already carries a context7 entry (enabling it flips `disabled:false`) |
| In-plugin LSP / AST | blocked | **partial** | Full in-plugin suite remains non-goal; can opt-in to omo author's external stdio servers (lsp-tools-mcp / pi-ast-grep) as optional enhancement |
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

## Next spiral focus (提升)

v0.12 候选(nested-AGENTS 加厚已于 v0.11 落地):

- **候选A — README 官方 marketplace 分发 + MCP 推荐**:在 README/README.en 加官方 plugin marketplace(github.com/xai-org/plugin-marketplace)安装入口与推荐 MCP(context7 / omo 作者 lsp-tools-mcp / pi-ast-grep)。理由:分发是 star 增长与 "must-install" 定位的关键缺口,成本极低。
- **候选B — project memory 持久层**:跨会话记住决策(选定 subagent 偏好、已废弃方案),让 CATEGORY_DISCIPLINE 门禁携带历史语义。理由:每会话重置决策导致重复返工。
- **候选C — hashline Windows 路径规范化**:用 `path.resolve` 替代 replace+toLowerCase 建缓存 key(早期审视 Top5)。理由:Windows 开发者占比高,路径处理可能导致状态丢失 / 缓存失效。

**推荐 v0.12 = 候选A**(README marketplace)。分发缺口是当前最高杠杆、最低成本项;B/C 可作为后续螺旋。

## Explicit non-goals

- Team Mode / tmux  
- Multi-provider model routing  
- Full in-plugin LSP/AST suite — **放弃** (distinct from adopting an existing external MCP server, which is an optional enhancement, not a non-goal)
- Forking omo source  

> 注："Full in-plugin LSP/AST suite"(自己从零内建 LSP/AST 工具链,放弃)≠ "接入既有外部 MCP server"(按需挂载 lsp-tools-mcp / pi-ast-grep,属可选增强)。两者明确区分,不混为一谈。

## Product thesis

Grok “must-install” = hard discipline hooks, not OpenCode multi-model OS clone. Spiral: critique real gaps → ship gates → elevate next focus.
