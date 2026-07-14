# oh-my-grok vs oh-my-openagent (omo) — capability inventory

**Date:** 2026-07-14 · **omg version:** 0.9.x  
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

1. **Category spawn discipline** — banners only; no Stop force when deep/visual work never spawned specialists  
2. **Background agent babysitter** — path open (spawn_subagent + post-tool-spawn matcher + agent-guard role parse), only the Stop gate is missing; folded into v0.10 CATEGORY_DISCIPLINE design  
3. **Hashline native edit tool** — host tool registration limit  
4. **Stronger AST-aware comment rewrite** — optional external binary  

## Closed this spiral (v0.9)

| Item | Behavior |
|------|----------|
| Plan-review gate | `/start-work` blocked unless plan has ## Review checked / Metis / Momus VERDICT: PASS |
| Comment aggregate | ≥3 slop hits → one Stop `COMMENT_AGGREGATE` yank |

## Next spiral focus (提升)

**Priority:** Category execution discipline — when IntentGate/category is `deep` / `visual-engineering` / `ultrabrain` and session has zero spawn_subagent activity, Stop once with CATEGORY_DISCIPLINE reason listing recommended subagents. Keep Team Mode / multi-model as non-goals.

## Explicit non-goals

- Team Mode / tmux  
- Multi-provider model routing  
- Full in-plugin LSP/AST suite — **放弃** (distinct from adopting an existing external MCP server, which is an optional enhancement, not a non-goal)
- Forking omo source  

> 注："Full in-plugin LSP/AST suite"(自己从零内建 LSP/AST 工具链,放弃)≠ "接入既有外部 MCP server"(按需挂载 lsp-tools-mcp / pi-ast-grep,属可选增强)。两者明确区分,不混为一谈。

## Product thesis

Grok “must-install” = hard discipline hooks, not OpenCode multi-model OS clone. Spiral: critique real gaps → ship gates → elevate next focus.
