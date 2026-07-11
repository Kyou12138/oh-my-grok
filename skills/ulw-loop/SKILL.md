---
name: ulw-loop
description: Ultrawork loop v2 — phase machine explore→implement→verify, hard DONE gate, progress logs. /ulw-loop, ultrawork, or mid-sentence ulw.
user_invocable: true
---

# Ultrawork / ULW Loop v2

## Start

```
/ulw-loop "ship the feature end-to-end"
ultrawork 重构登录
fix flaky tests ulw
```

Also: `/ultrawork`, `/ulw`, bare or **mid-sentence** `ulw` / `ultrawork`.

## Phases (state machine)

| Phase | You must |
|-------|----------|
| **explore** | Search/Read codebase (spawn `explore`). Record findings. |
| **implement** | Write code (spawn `hephaestus` if deep). |
| **verify** | Run tests/lint/typecheck. |

Hooks advance phases from Read/Write activity.

## DONE gate (hard)

`<promise>DONE</promise>` is **rejected** unless:

1. Explore evidence (Reads)  
2. Implement evidence (Writes) — unless pure research task with writes=0 already past implement  
3. Verify: `<promise>VERIFIED</promise>` **or** diagnostics clean / tests passed  
4. No incomplete todos  
5. No failing `diagCommand` errors  

Recommended finish:

```
<promise>VERIFIED</promise>
<promise>DONE</promise>
```

## Artifacts

| Path | Content |
|------|---------|
| `.omg/ralph-loop.local.md` | Human-readable loop state |
| `.omg/ulw-loop/state.json` | Machine state (phase, stalls) |
| `.omg/ulw-loop/log/iter-NNN-*.md` | Per-iteration audit log |

## Stall

If a round has **no Read/Write**, Stop injects STALL and demands a strategy change.

## Cancel

```
/cancel-ralph
```
