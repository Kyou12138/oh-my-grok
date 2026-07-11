---
name: init-deep
description: Generate hierarchical AGENTS.md files throughout the project for token-efficient agent context. Use /init-deep.
---

# /init-deep

Create directory-scoped `AGENTS.md` files so agents pick up local conventions.

## Usage

```
/init-deep
/init-deep --max-depth=3
/init-deep --create-new --max-depth=2
```

| Flag | Meaning |
|------|---------|
| `--max-depth=N` | How deep to walk from workspace root (default 3, max 8) |
| `--create-new` | Prefer creating stubs (default behavior for empty/missing) |

## Behavior

1. Walks the tree (skips `node_modules`, `.git`, `dist`, …).
2. Writes `AGENTS.md` at root and code-bearing directories.
3. Does **not** overwrite large hand-written AGENTS.md (keeps user content).

## After generation

1. Edit stubs with real build/test commands and conventions.
2. Agents auto-receive nearby AGENTS.md via directory inject after Read.

## Related

- Root `AGENTS.md` / `rules/*` still inject on every UserPrompt.
- omo equivalent: `/init-deep` hierarchical knowledge base.
