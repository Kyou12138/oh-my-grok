# oh-my-grok vs oh-my-openagent (omo) — capability inventory

**Date:** 2026-07-11 · **omg version:** 0.9.x  
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
| In-plugin LSP / AST | — | **blocked** |
| Built-in Exa/Context7 MCP | — | **blocked** |

## Grok-feasible gaps still open (after v0.9)

1. **Category spawn discipline** — banners only; no Stop force when deep/visual work never spawned specialists  
2. **Background agent babysitter** — host spawn APIs incomplete  
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
- Full in-plugin LSP/AST suite  
- Forking omo source  

## Product thesis

Grok “must-install” = hard discipline hooks, not OpenCode multi-model OS clone. Spiral: critique real gaps → ship gates → elevate next focus.
