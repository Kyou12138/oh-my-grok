# Grok Build open-source hook notes

Source: [xai-org/grok-build](https://github.com/xai-org/grok-build) (Apache-2.0), crate `xai-grok-hooks` + `xai-grok-agent` plugins adapter.  
Synced for oh-my-grok **v1.1.0** adaptation.

## What the host actually does

### Blocking vs non-blocking

| Event | Blocking? | stdout used? |
|-------|-----------|--------------|
| **PreToolUse** | **Yes** (only one) | **Yes** — `{"decision":"deny"\|"allow","reason"?}` or exit `2` = deny |
| SessionStart | No | **Ignored** (exit code only) |
| UserPromptSubmit | No | **Ignored** |
| PostToolUse | No | **Ignored** |
| Stop / StopFailure | No | **Ignored** |
| SessionEnd | No | **Ignored** |
| SubagentStart / SubagentEnd | No | **Ignored** |

Fail-open: PreTool timeouts/crashes/malformed JSON → **allow** (tool continues).

Implications for oh-my-grok:

- **Hard discipline that works in TUI:** PreTool gates (agent-guard, plan-mode, hashline, skill-gate, comment deny).
- **Stop `{decision:block}` / UserPrompt `additionalContext`:** still emitted for tests + future hosts; **current Grok runner does not re-prompt or inject from stdout.** Side effects (write `.omg` state) still run and help SessionStart resume / next PreTool.
- **Sisyphus text not in `/hooks` UI:** expected — non-blocking stdout is not displayed or injected by the runner.

### Plugin-supported events only

`hooks_adapter.rs` **pre-filters** plugin `hooks.json` to:

```
SessionStart, PreToolUse, PostToolUse, SessionEnd,
Notification, Stop, UserPromptSubmit,
SubagentStart, SubagentEnd
```

Not loaded from plugins (skipped with warning): `PostToolUseFailure`, `PermissionDenied`, `PreCompact`, `PostCompact`, `StopFailure`, **`SubagentStop`** (use **`SubagentEnd`**).

### Envelope wire format (camelCase)

Flattened JSON on stdin, e.g.:

```json
{
  "hookEventName": "pre_tool_use",
  "sessionId": "...",
  "cwd": "...",
  "workspaceRoot": "...",
  "timestamp": "...",
  "toolName": "Write",
  "toolUseId": "...",
  "toolInput": { },
  "toolResult": { },
  "subagentType": "explore",
  "prompt": "...",
  "reason": "..."
}
```

PostTool uses **`toolResult`**, not `toolOutput`. oh-my-grok maps both.

### Env always set on hook process

`GROK_HOOK_EVENT`, `GROK_HOOK_NAME`, `GROK_SESSION_ID`, `GROK_WORKSPACE_ROOT`, `CLAUDE_PROJECT_DIR`  
Plugin: `GROK_PLUGIN_ROOT`, `GROK_PLUGIN_DATA` (+ Claude aliases).

## oh-my-grok v1.1 adaptations

1. Parse `toolResult` + `subagentType` + native envelope fields.  
2. Register **SubagentStart** / **SubagentEnd** → arm / clear spawn follow-through (host lifecycle, not assistant prose).  
3. Contract docs match source (PreTool = only host-enforced gate).  
4. Keep Stop/UserPrompt handlers for state + offline tests.

## v1.1.1 pitfall (parent sticky)

`SubagentStart` is fired on the **parent** session (`updates.rs` → `self.fire_hook`).  
Do **not** `setSessionAgentRole(subagentType)` there or on PostTool spawn — sticky `explore` poisons parent `AGENT_GUARD` when the host omits `agentName` on later Write tools.

## v1.1.3 pitfall (SubagentEnd ≠ recovery)

`SubagentEnd` means the **child process finished**, not that the parent integrated findings.  
Clearing spawn follow-through on End lets the parent idle-stop without `get_task_output`.  
End only marks `childFinished`; clear via recovery tools / progress / recovered language.

## v1.1.7 pitfall (matcher exact / case-sensitive)

Simple-form `matcher` strings (only `[A-Za-z0-9_|]`) are **exact** equality per `|` term — not regex, not case-insensitive.  
List both `search_replace` and `SearchReplace` (and similar) or the host will skip the hook.
