# oh-my-grok Hook Contract

Aligned with **xai-org/grok-build** open source (`xai-grok-hooks`, plugin `hooks_adapter`).  
See also [grok-build-source.md](./grok-build-source.md).

## Command

```
node "${GROK_PLUGIN_ROOT}/dist/cli.js" <event>
```

| Host event (hooks.json) | CLI argv |
|-------------------------|----------|
| SessionStart | `session-start` |
| UserPromptSubmit | `user-prompt` |
| PreToolUse | `pre-tool-use` |
| PostToolUse (matchers) | `post-tool-read` / `post-tool-write` / `post-tool-shell` / `post-tool-todo` / `post-tool-spawn` |
| Stop | `stop` |
| SessionEnd | `session-end` |
| SubagentStart | `subagent-start` |
| SubagentEnd | `subagent-end` |

## Host semantics (source of truth)

| | PreToolUse | Other events |
|--|------------|--------------|
| Blocks tools? | **Yes** if `decision:deny` or exit 2 | **No** |
| stdout | Parsed | **Discarded** (exit code only) |
| Fail-open | Yes on crash/timeout/bad JSON | Yes |

oh-my-grok still **writes** `additionalContext` / Stop `decision:block` for tests and forward-compat; **do not assume** current Grok TUI injects or re-yanks from those strings.

## PreToolUse order (enforced)

1. Agent guard (read-only roles)  
2. Prometheus plan-mode path deny  
3. Hashline (fresh Read + old_string + LINE#ID)  
4. Comment checker hard deny (when deny mode)  
5. Skill Gate  

## Stop order (state machine; stdout not host-enforced)

Handlers still run and mutate `.omg` / session state (Ralph phase, boulder, spawn pending, todos).  
Order: Ralph → Boulder → Category discipline → Spawn follow-through → Todos → Diag → Plan checkboxes → Comment aggregate.

## Outputs

| Scenario | stdout | exit | Host effect |
|----------|--------|------|-------------|
| PreTool deny | `{"decision":"deny","reason":"..."}` | 2 | **Tool blocked** |
| PreTool allow | `{"decision":"allow"}` | 0 | Tool runs |
| Stop / Session / UserPrompt | `{}` or optional JSON | 0 | Side effects only on current host |
| Errors | allow / `{}` | 0 | Fail-open |

## Stdin envelope (camelCase)

Prefer: `sessionId`, `workspaceRoot`, `cwd`, `prompt`, `toolName`, `toolInput`, **`toolResult`**, `toolUseId`, `subagentType`, `reason`, `hookEventName`.  
Snake_case aliases still accepted.

## Env

- Host: `GROK_PLUGIN_ROOT`, `GROK_PLUGIN_DATA`, `GROK_SESSION_ID`, `GROK_WORKSPACE_ROOT`, `GROK_HOOK_EVENT`, `GROK_HOOK_NAME`
- Plugin: `OMG_*` toggles — see `docs/config.example.json`

## Doctor

```bash
npm run doctor
```
