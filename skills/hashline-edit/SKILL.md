---
name: hashline-edit
description: Safe edits with oh-my-grok Hashline — Read first, LINE#ID anchors, no stale StrReplace.
user_invocable: true
---

# Hashline Edit

## Workflow

1. **`Read` / `read_file`** the target path first (builds Hashline session cache + `<HASHLINE_CACHE>` on next prompts).
2. Edit with `StrReplace` / `search_replace` / `Write` using **exact current text** from that Read.
3. Optional anchors from cache: `12#AB| const x = 1` — `AB` must match cache; text after `|` must equal the live line.

## Failures

| Message | Fix |
|---------|-----|
| No fresh Read cache | **Read** that path, then edit |
| Read cache expired | **Read** again (TTL) |
| File changed since last Read | **Read** again; disk moved |
| old_string not found | **Read**; paste exact contiguous snippet |
| LINE#ID mismatch / body mismatch | **Read**; copy lines from new `<HASHLINE_CACHE>` |

## Grok tip

PreTool only runs Hashline on mutating tools (Write / StrReplace / …). Pure Read is free. Host has no native Hashline edit tool — this gate is the substitute.

Inspired by omo / oh-my-pi hash-anchored edits.
