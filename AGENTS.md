# oh-my-grok — for coding agents

Human install/features: **README.md**. Hook contract: **docs/contract.md**. Design: **docs/superpowers/specs/**.

## Architecture

```
hooks/hooks.json → node dist/cli.js <event>
src/cli.ts → events/* → features/* → state/*
agents/  — Sisyphus team
skills/  — Grok-specific + using-superpowers bootstrap
vendor/superpowers/skills — obra/superpowers (npm run vendor:superpowers)
rules/   — always injected on UserPrompt
```

## Hard rules

1. One hook registration per event; merge UserPrompt in `user-prompt.ts`.
2. Stop chain order only in `events/stop.ts`: Ralph → Boulder → Todo → plan checkboxes.
3. PreTool order: Agent Guard → plan-mode → Hashline → CommentChecker → Skill Gate.
4. Fail-open in `cli.ts` catch.
5. No bash launcher — Windows uses `node dist/cli.js`.
6. Do not dual-enable mihazs oh-my-grok.

## Dev

```bash
npm install
npm run build
npm test
npm run doctor
npm run vendor:superpowers
npm run validate
```

Local install:

```bash
grok plugin install "D:\Data\code\VibeCoding\oh-my-grok" --trust
grok plugin enable oh-my-grok
```

Reload hooks: new session or TUI Hooks reload.
