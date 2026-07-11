# oh-my-grok Hook Contract

Authoritative I/O for Grok Build hooks (aligned with production behavior used by mihazs/oh-my-grok).

## Command

```
node "${GROK_PLUGIN_ROOT}/dist/cli.js" <event>
```

Events: `session-start` | `user-prompt` | `pre-tool-use` | `post-tool-read` | `post-tool-todo` | `post-tool-write` | `stop` | `session-end`

## PreToolUse order

1. Prometheus plan-mode path deny  
2. Hashline (fresh Read + old_string match + LINE#ID)  
3. Skill Gate  

## Stop order

1. Ralph / ULW  
2. Boulder  
3. Todo enforcer  
4. Diagnostics (errors hard-block; soft verify once if no `diagCommand`)  
5. Plan checkboxes

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

Workspace file: `.omg/config.json` (see `docs/config.example.json`).
