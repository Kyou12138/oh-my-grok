# oh-my-grok Hook Contract

Authoritative I/O for Grok Build hooks (aligned with production behavior used by mihazs/oh-my-grok).

## Command

```
node "${GROK_PLUGIN_ROOT}/dist/cli.js" <event>
```

Events: `session-start` | `user-prompt` | `pre-tool-use` | `post-tool-read` | `post-tool-todo` | `post-tool-write` | `post-tool-shell` | `post-tool-spawn` | `stop` | `session-end`

## PreToolUse order

1. Agent guard (read-only roles: oracle/explore/librarian/metis/momus; fail-open if no role)  
2. Prometheus plan-mode path deny  
3. Hashline (fresh Read + old_string match + LINE#ID tag **and** body)  
4. Comment checker hard deny (when `commentCheckerDeny`)  
5. Skill Gate  

## Stop order

1. Ralph / ULW (+ idle fluff note when loop active)  
2. Boulder (blocks while active; open plan checkboxes called out; DONE/VERIFIED clears when checkboxes complete; `/cancel-boulder`)  
2.5 Category discipline — specialist work (deep/visual-engineering/ultrabrain) + zero session spawns => block once  
3. Todo enforcer (+ **idle-turn** bypasses cooldown when reply is fluff/empty)  
4. Diagnostics (errors hard-block; soft verify once if no `diagCommand`)  
5. Plan checkboxes (fallback when no boulder)
6. Comment slop aggregate (soft, once per session) — aligns `commentAggregateStopReason` in `src/events/stop.ts`

## Outputs

| Scenario | stdout | exit |
|----------|--------|------|
| PreToolUse deny | `{"decision":"deny","reason":"..."}` | 2 |
| PreToolUse allow | `{"decision":"allow"}` | 0 |
| Stop continue | `{"decision":"block","reason":"..."}` | 0 |
| Stop release | `{}` | 0 |
| UserPrompt / SessionStart | `{"additionalContext":"..."}` | 0 |

Fail-open: unexpected errors → allow/empty + exit 0.

## Env

- `GROK_PLUGIN_ROOT`, `GROK_PLUGIN_DATA`, `GROK_SESSION_ID`, `GROK_WORKSPACE_ROOT`
- `OMG_STATE_DIR` (default `.omg`)
- `OMG_SKILL_GATE`, `OMG_INTENT_GATE`, `OMG_PLAN_MODE` (`0` to disable)
- `OMG_MAX_RALPH_ITER`, `OMG_TODO_COOLDOWN_MS`
- `OMG_HASHLINE`, `OMG_DIAG_ENFORCE`, `OMG_HARD_ORCH`, `OMG_DIAG_CMD`
- `OMG_COMMENT_CHECKER` (`0` off, `1` soft warn, `deny` = hard via PreTool)
- `OMG_COMMENT_CHECKER_DENY`, `OMG_AGENT_GUARD`
- `OMG_CATEGORY_DISCIPLINE` (默认开, `0` 关闭)
- `OMG_DIAG_TIMEOUT_MS` (default `60000` ms) · `OMG_HASHLINE_TTL_MS` (default `1800000` ms) · `OMG_TODO_ABORT_WINDOW_MS` (default `3000` ms)
- `GROK_AGENT_NAME` / `OMG_AGENT_ROLE` for agent-guard role detection

Workspace file: `.omg/config.json` (see `docs/config.example.json`).

## Doctor

```bash
npm run doctor
```
