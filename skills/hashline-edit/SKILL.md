---
name: hashline-edit
description: Safe edits with oh-my-grok Hashline — Read first, LINE#ID anchors, no stale StrReplace.
user_invocable: true
---

# Hashline Edit

## Workflow

1. `Read` the target file (builds Hashline cache + LINE#ID preview in next prompts).
2. Edit with `StrReplace` / `Write` using **exact current text**.
3. Optional anchors: `12#AB| const x = 1` — TAG must match cache.

## Failures

| Message | Fix |
|---------|-----|
| No fresh Read cache | Read the file again |
| File changed since last Read | Re-Read |
| old_string not found | Re-Read; copy exact bytes |
| LINE#ID mismatch | Re-Read; update tags |

Inspired by omo / oh-my-pi hash-anchored edits.
