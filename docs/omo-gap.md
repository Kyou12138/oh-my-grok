# oh-my-grok vs oh-my-openagent (omo) — capability inventory

**Date:** 2026-07-11 · **omg version:** 0.8.x  
**Purpose:** Honest map of omo-defining harness capabilities → what Grok can ship.  
**Stars are a community outcome**; this doc tracks **functional** gaps only.

## Legend

| Tag | Meaning |
|-----|---------|
| **shipped** | Real hooks/handlers + tests |
| **partial** | Semantics present, thinner than omo |
| **blocked** | Needs OpenCode-class plugin/tool APIs or multi-model host |

## Inventory

| omo capability | oh-my-grok | Status |
|----------------|------------|--------|
| Ralph / ultrawork / ULW loop | ULW v3 phase machine, DONE gate, shell→verify, stall, **multi-goal** | **shipped** |
| Todo continuation enforcer | Mirror + Stop yank + cooldown + **abort-window** | **shipped** (partial vs omo depth) |
| Prometheus plan-mode | `/plan` write lock + Metis/Momus copy | **shipped** (partial) |
| IntentGate keyword modes | search/analyze/debug/ulw/team/hyperplan | **shipped** |
| Think / ultrathink effort | think-mode injection (v0.7) | **shipped** |
| Hashline LINE#ID edits | PreTool tag+body guard + Read inject | **partial** (no native edit tool) |
| Skill force-use | Intent Skill Gate + catalog | **shipped** |
| Comment checker | Soft warn + optional hard deny | **partial** (no separate binary) |
| Discipline agents | 9 thin agents + Agent Guard | **partial** (no model matrix) |
| Background / parallel agents | Host `spawn_subagent` only | **partial** |
| Session agent role lock | Sticky session role + spawn track (v0.7) | **shipped** |
| Idle / empty-turn yank | Stop idle-turn detection (v0.7) | **shipped** |
| Team Mode + tmux | — | **blocked** |
| Multi-provider model routing / fallback | — | **blocked** |
| In-plugin LSP / AST-grep suite | — | **blocked** |
| Built-in Exa / Context7 / grep_app MCP | — | **blocked** (use host MCP) |
| 54+ lifecycle hooks | ~6–8 events, merged logic | **partial** |
| Claude Code compat layer | — | **blocked** / N/A |

## Grok-feasible gaps (remaining after v0.8)

1. **Category → model routing** — only prompt categories; host cannot multi-model route  
2. **Hashline as real edit tool** — needs custom tool registration (host limit)  
3. **Stronger comment-checker** — optional external binary / AST-aware scan  
4. **Background agent manager** — depends on host spawn/notification APIs  
5. **Todo abort-window** — *(v0.8 shipped: re-yank on abort-like stopReason within window)*  
6. **Multi-goal ULW** — *(v0.8 shipped: parse `;`/`|`/numbered goals, GOAL_DONE, DONE gate)*  

## Closed recently

| Version | Gaps closed |
|---------|-------------|
| v0.7 | Think-mode, sticky agent role, idle-turn |
| v0.8 | Multi-goal ULW, Todo abort-window |

## Explicit non-goals (do not promise)

- Team Mode / tmux multi-pane  
- Multi-provider model matrix + runtime fallback  
- Full in-plugin LSP/AST product suite  
- Forking omo source  

## Product thesis

On Grok Build, “must-install” means **hard discipline** (loops, gates, stop yank), not cloning OpenCode’s multi-model OS. Ship the spine; document the ceiling.
