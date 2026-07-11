---
name: ralph-loop
description: Start a work-until-done Ralph loop. Use /ralph-loop "task". Completes with <promise>DONE</promise>.
user_invocable: true
---

# Ralph Loop

## Start

```
/ralph-loop "fix the failing tests"
```

State file: `.omg/ralph-loop.local.md`

## Behavior

On each Stop, if not done, the hook **blocks** stop and injects continuation instructions.

## Finish

When fully complete, output exactly:

```
<promise>DONE</promise>
```

## Cancel

```
/cancel-ralph
```
