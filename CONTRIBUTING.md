# Contributing to oh-my-grok

Thanks for helping make the Grok Build harness better.

## Quick start (dev)

```bash
git clone https://github.com/Kyou12138/oh-my-grok.git
cd oh-my-grok
npm install
npm run build
npm test
npm run doctor
npm run validate
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
| Harness reliability | Ralph/ULW, Stop chain, gates — keep fail-open + tests |
| Docs / DX | README wow path honesty, doctor messages, contract |
| Agents / skills | Thin agents + Grok-specific skills under `skills/` |
| Superpowers vendor | Do **not** hand-edit `vendor/superpowers`; run `npm run vendor:superpowers` |

**Non-goals for most PRs:** Team Mode, multi-provider model matrix, forking omo source, dual-enable with mihazs/oh-my-grok.

## Rules of the codebase

1. **One hook command per event** in `hooks/hooks.json`; merge logic in `src/events/*`.
2. **Stop order** only in `src/events/stop.ts` (Ralph → Boulder → Todo → diag → plan).
3. **PreTool order:** Agent Guard → plan-mode → Hashline → Comment Checker → Skill Gate.
4. **Fail-open** in `src/cli.ts` catch (except intentional PreTool deny).
5. **Windows-first:** `node dist/cli.js`, no bash launcher.
6. **TDD for harness behavior:** add/adjust tests under `tests/` before claiming new gates.

## PR checklist

- [ ] `npm run build && npm test && npm run doctor && npm run validate` pass
- [ ] New behavior has a test that drives shipped code (`src/` / CLI path)
- [ ] README / CHANGELOG updated if user-facing
- [ ] No secrets or personal machine paths committed

## Reporting issues

Include: Grok Build version (if known), OS, `npm run doctor` output, and whether Ralph/ULW was active. Minimal repro prompts help a lot.

## License

By contributing you agree contributions are under the MIT License (see `LICENSE`).
