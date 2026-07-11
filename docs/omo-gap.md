# oh-my-grok vs oh-my-openagent (omo) — capability inventory

**Date:** 2026-07-11 · **omg version:** 0.7.x  
**Purpose:** Honest map of omo-defining harness capabilities → what Grok can ship.  
**Stars (~1k) are a community outcome**; this doc tracks **functional** gaps only.

## Legend

| Tag | Meaning |
|-----|---------|
| **shipped** | Real hooks/handlers + tests |
| **partial** | Semantics present, thinner than omo |
| **blocked** | Needs OpenCode-class plugin/tool APIs or multi-model host |

## Inventory

| omo capability | oh-my-grok | Status |
|----------------|------------|--------|
| Ralph / ultrawork / ULW loop | ULW v2 phase machine, DONE gate, shell→verify, stall | **shipped** |
| Todo continuation enforcer | Mirror + Stop yank + cooldown | **shipped** (partial vs omo depth) |
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
| 54+ lifecycle hooks | ~6 events, merged logic | **partial** |
| Claude Code compat layer | — | **blocked** / N/A |

## Grok-feasible gaps (named — remaining or just closed)

1. **Think-mode / ultrathink** — inject extended-effort protocol on keywords *(v0.7)*  
2. **Sticky session agent role** — persist role for Agent Guard when host omits `agentName` on later tools *(v0.7)*  
3. **Idle / empty assistant turn yank** — Stop blocks fluff/empty when todos/plan/loop still open *(v0.7)*  
4. **Stronger Todo Enforcer** — still thinner than omo (cooldown/max only); future: abort-window parity  
5. **Category → model routing** — only prompt categories; host cannot multi-model route  
6. **Hashline as real edit tool** — needs custom tool registration (host limit)

## Explicit non-goals (do not promise)

- Team Mode / tmux multi-pane  
- Multi-provider model matrix + runtime fallback  
- Full in-plugin LSP/AST product suite  
- Forking omo source  

## Product thesis

On Grok Build, “must-install” means **hard discipline** (loops, gates, stop yank), not cloning OpenCode’s multi-model OS. Ship the spine; document the ceiling.
