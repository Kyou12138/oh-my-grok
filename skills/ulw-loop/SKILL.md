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

## Opening ceremony / 开场仪式 (required)

When ULW **starts** (or you re-enter an active ULW session), treat the first reply as a **ritual**, not a casual ack.

Hook inject + disk: `.omg/ulw-loop/CEREMONY.md` (survives if inject is dropped).

**Hard gates:**

| Gate | Since | Behavior |
|------|-------|----------|
| **PreTool ceremony** | v1.1.58 | Write / Edit / mutating shell **denied** until opener seen |
| **PreTool explore** | v1.1.63 | After ceremony, mutates still **denied** until at least one Read (未 explore 不写) |
| **Stop** | v1.1.49 | Skip opener → `CEREMONY INCOMPLETE` / 开场仪式未完成；loop 保持；DONE 被拦 |
| **DONE evidence** | v1.1.63 | implement writes required unless task is **research-only**；stall×3 escalate / ×5 critical |

### Required first message shape

```text
ULTRAWORK MODE ENABLED!

Goal: <restate the task in one line>

Then begin **explore** immediately (Read / search / spawn explore).
```

Chinese opener alternative (整行其一即可):

```text
ULTRAWORK 模式已启动！
```

### Ritual steps

1. **Line 1** — exactly `ULTRAWORK MODE ENABLED!` or `ULTRAWORK 模式已启动！` (no prefix/suffix/fence)
2. **Line 2** — one-line goal restatement
3. **From paragraph 3** — enter **explore** with concrete tools; no pure status chatter
4. **Only after ceremony** — Write / implement / mutating shell

【誓词 OATH】未 explore 不写 · 未 verify 不 DONE · 未仪式不开工

禁止：`ok` / `继续` / `好的` · 跳过开场 · 先写后喊 · 未 VERIFIED 就 DONE

Motto: **开始。推巨石。不得空转。** 🔔 鸣锣开场

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

## Stall (omo-aligned escalation)

| stallCount | Stop signal |
|------------|-------------|
| 1–2 | STALL DETECTED — change strategy |
| ≥3 | STALL ESCALATED — must spawn explore/oracle or run real verify |
| ≥5 | STALL CRITICAL — narrow scope / report blocker; no fluff |

Shell (e.g. `npm test`) counts as progress when implement already reached.

## Cancel

```
/cancel-ralph
```
