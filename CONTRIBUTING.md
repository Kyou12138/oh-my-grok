# Contributing to oh-my-grok

Thanks for helping make the Grok Build harness better.

## Quick start (dev)

```bash
git clone https://github.com/Kyou12138/oh-my-grok.git
cd oh-my-grok
npm install
npm run ci          # build + test + doctor + validate
```

### CI

| Path | Role |
|------|------|
| `npm run ci` / `scripts/ci.mjs` | **Canonical checks** (run everywhere) |
| `docs/ci.workflow.yml` | GitHub Actions template |

To enable Actions on GitHub (needs a token with the `workflow` scope):

```bash
mkdir -p .github/workflows
cp docs/ci.workflow.yml .github/workflows/ci.yml
git add .github/workflows/ci.yml && git commit -m "ci: enable GitHub Actions" && git push
```

Local install into Grok:

```bash
grok plugin install "$(pwd)" --trust   # Windows: absolute path
grok plugin enable oh-my-grok
```

Reload hooks with a **new session** after changing `hooks/` or `dist/`.

## What to work on

| Area | Notes |
|------|--------|
| **PreTool hard gates** | Highest ROI — only path Grok host hard-enforces (see `docs/contract.md`) |
| State machines | Ralph/ULW/Todo/Boulder write `.omg`; Stop stdout is **not** host re-yank |
| Docs / DX | README promises **⊆** contract; wow path = install + doctor + PreTool probe |
| Agents / skills | Thin agents + Grok-specific skills under `skills/` |
| Superpowers vendor | Do **not** hand-edit `vendor/superpowers`; run `npm run vendor:superpowers` |

**Non-goals for most PRs:** Team Mode, multi-provider model matrix, forking omo source, dual-enable with mihazs/oh-my-grok, PRs that **require Stop stdout** for user-visible “continue”.

## Priority funnel

1. User feels it?  
2. Relies on **PreTool deny**? → **P0**  
3. Only `.omg` + skill copy? → **P1** (label **soft** / host-limited)  
4. Pretends host has omo Ultimate? → **don’t ship**

## Rules of the codebase

1. **One hook command per event** in `hooks/hooks.json`; merge logic in `src/events/*`.
2. **Stop order** only in `src/events/stop.ts` (state machine; stdout discarded on current Grok).
3. **PreTool order** (breaking-change gate — keep `tests/pre-tool-orchestration.test.ts` green):  
   Agent Guard → prometheus-role → plan-mode → category-discipline → spawn-followthrough → diag hard → Hashline → Comment → Skill Gate (skip for plan-mode plan-only writes).
4. **Fail-open** in `src/cli.ts` catch (except intentional PreTool deny).
5. **Windows-first:** `node dist/cli.js`, no bash launcher.
6. **TDD for harness behavior:** add/adjust tests under `tests/` before claiming new gates.
7. **Matcher case sensitivity:** host simple matchers are **exact / case-sensitive** — register both `search_replace` and `SearchReplace` (etc.) in `hooks/hooks.json`. Normalize in code via `normalizeToolName` (`[^a-z]` stripped).
8. **Pure logic vs host I/O:** prefer pure functions in `src/features/*`; stdin/stdout only in `cli` + `events/*`. Do not encode OpenCode-only assumptions (tool-output rewrite, session.prompt yank) as required behavior.

## PR checklist

- [ ] `npm run build && npm test && npm run doctor && npm run validate` pass
- [ ] New behavior has a test that drives shipped code (`src/` / CLI path)
- [ ] If user-facing: README claims still ⊆ `docs/contract.md`
- [ ] PreTool order tests still pass if you touched `pre-tool-use.ts`
- [ ] No secrets or personal machine paths committed
- [ ] If `dist/` is committed: build before commit so dist matches `src/`

## Reporting issues

Include: Grok Build version (if known), OS, `npm run doctor` output, and whether Ralph/ULW was active. Minimal repro prompts help a lot.

## License

By contributing you agree contributions are under the MIT License (see `LICENSE`).
