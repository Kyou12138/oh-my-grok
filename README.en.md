# oh-my-grok

[![CI](https://img.shields.io/badge/CI-npm%20run%20ci-brightgreen)](./scripts/ci.mjs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![Grok Build](https://img.shields.io/badge/Grok%20Build-plugin-111827)](https://x.ai)
[![Tests](https://img.shields.io/badge/tests-vitest-blue)](./CONTRIBUTING.md)

[中文](./README.md) | **English**

**omo-style agent harness + Superpowers methodology for [Grok Build](https://x.ai).** · **v1.1.3** (aligned with [grok-build](https://github.com/xai-org/grok-build) open-source hooks)

Install once. Type `ultrawork`. Hooks force the agent to explore → implement → verify until the work is actually done.

> **Repo:** https://github.com/Kyou12138/oh-my-grok  
> **Requires:** Grok Build CLI + Node.js 20+  
> Community plugin — **not** an xAI product. “Grok” is a trademark of xAI.

---

## The problem

Vanilla Grok Build is a strong coding agent. On long tasks it still drifts:

| Failure mode | What happens without a harness |
|--------------|--------------------------------|
| Stops early | Declares “done” with open todos |
| Edits blind | Mutates files without reading skills or current content |
| Skips process | No brainstorm → plan → TDD → verify |
| Soft stops | Idle when the boulder is only half up the hill |

**oh-my-grok** is the harness: hooks that **enforce** discipline (loops, gates, stop continuation) plus **Superpowers** skills that teach how to ship correctly.

---

## 30-second install

```bash
# Recommended: GitHub shorthand (user/repo)
grok plugin install Kyou12138/oh-my-grok --trust
grok plugin enable oh-my-grok
```

Or full git URL:

```bash
grok plugin install https://github.com/Kyou12138/oh-my-grok --trust
grok plugin enable oh-my-grok
```

Open a **new** Grok session (or reload Hooks). You should see Sisyphus / Superpowers context inject.

**Local path (Windows):**

```bash
git clone https://github.com/Kyou12138/oh-my-grok.git
cd oh-my-grok
# dist/ is committed; rebuild only if you change source: npm install && npm run build
grok plugin install "D:\path\to\oh-my-grok" --trust
grok plugin enable oh-my-grok
```

---

## Distribution channels

oh-my-grok is a **community plugin, not an xAI product** (see disclaimer above). Two install paths with independent trust chains:

- **GitHub direct (primary, recommended for this repo)** — the `grok plugin install Kyou12138/oh-my-grok --trust` above. `--trust` is required by the platform (the plugin executes code and reads/writes local data); no external index needed, works at any time.
- **Official marketplace (browse)** — [xai-org/plugin-marketplace](https://github.com/xai-org/plugin-marketplace) is the xAI-maintained plugin index; browse it interactively with `/plugin` (or `/marketplace`) in the Grok Build terminal. Integrity is guaranteed by the index's **commit-SHA pin** (Grok Build re-verifies `git rev-parse HEAD == sha` after cloning) — a **different trust chain** from `--trust` direct install.

> oh-my-grok is **not yet listed** in the official marketplace index; use the GitHub direct install. Both paths are community, not affiliated with xAI.

---

## Wow path (copy-paste)

### 1) Ultrawork — work until verified

```text
ultrawork fix the failing tests and don't stop until green
```

**What the harness does (real behavior, covered by tests):**

1. Starts a **ULW loop** (phase machine: `explore → implement → verify`)
2. On **Stop**, if work is incomplete → **blocks** and continues the agent
3. Rejects bare `<promise>DONE</promise>` without explore/implement evidence + verification
4. Prefer: `<promise>VERIFIED</promise>` then `<promise>DONE</promise>`
5. Shell commands like `npm test` credit ULW verify (`post-tool-shell`)

Mid-sentence also works: `please ulw refactor the auth module`.

### 2) Ralph — named task loop

```text
/ralph-loop "ship the login bugfix with tests"
```

Cancel with `/cancel-ralph`. Pause all auto-continuation: `/stop-continuation`.

### 3) Plan then execute

```text
/plan "add OAuth to login"
```

Agent may only write under `.omg/plans/` (Prometheus plan-mode). Then:

```text
/start-work
```

Activates **boulder** execution (Atlas/Sisyphus). **Plan review required first**: check Metis/Momus items under `## Review`, or write `VERDICT: PASS` — otherwise `/start-work` is blocked.

---

## What you get

| Layer | Ships today |
|-------|-------------|
| **Harness** | Ralph / **ULW v3 multi-goal**, **Hashline** (Read-before-edit), **plan-review**, **spawn follow-through** (≤2 result-recovery yanks), SessionStart **state resume**, Todo/Boulder, idle-turn, sticky `/agent`, Category discipline, Comment aggregate, Agent Guard, Handoff resume, `/init-deep` |
| **Discipline agents** | Sisyphus · Hephaestus · Prometheus · Atlas · Oracle · Explore · Librarian · Metis · Momus |
| **Superpowers** | Vendored MIT skills: brainstorming, writing-plans, TDD, verification-before-completion, … |

### Honest comparison

| | Vanilla Grok | oh-my-grok | oh-my-openagent (omo) |
|--|--------------|------------|------------------------|
| Host | Grok Build | **Grok Build** | OpenCode (+ Codex Light) |
| Long-task loops / stop yank | Soft | **Hard hooks** | Hard |
| Superpowers methodology | Optional | **Bundled + Skill Gate** | Separate / partial |
| Multi-model routing | Host | Thin categories + spawn | Full matrix + fallbacks |
| Team Mode / tmux panes | — | **No** (platform limit) | Yes (Ultimate) |
| LSP / AST / 50+ hooks | Host tools | No in-plugin LSP/AST suite | Yes |

We **align on harness semantics** with omo; we do **not** claim Team Mode, multi-provider model routing, or full tool OS parity.

---

## Hashline (safe edits)

1. **Read** the target file first (builds LINE#ID cache).  
2. **StrReplace / Write** with **exact** current text as `old_string`.  
3. Optional: use `N#TAG| line` anchors from `<HASHLINE_CACHE>`.  
Editing an existing file without a prior Read is denied (skill: `hashline-edit`).

## Commands

| Command | Effect |
|---------|--------|
| `ultrawork` / `ulw` / `/ulw-loop` | ULW loop (explore → implement → verify) |
| `/ralph-loop "…"` | Work-until-done loop |
| `/cancel-ralph` | Clear loop |
| `/plan` · `/prometheus` | Plan mode (writes only `.omg/plans/`) |
| `/start-work` | Boulder from plan |
| `/cancel-boulder` | Clear active boulder |
| `/agent <role>` · `/as <role>` | Sticky session role (Agent Guard) |
| `/handoff` | Session handoff under `.omg/handoffs/` |
| `/init-deep` | Hierarchical `AGENTS.md` |
| `/stop-continuation` · `/resume-continuation` | Pause / resume auto-continue |

| Marker | Meaning |
|--------|---------|
| `<promise>VERIFIED</promise>` | Verification passed — preferred before DONE on ULW |
| `<promise>DONE</promise>` | Task complete (ULW evidence gate + multi-goal `GOAL_DONE`) |
| `GOAL_DONE: <text>` | Mark one ULW multi-goal complete |

---

## Trust & health

```bash
npm install
npm run ci            # build + test + doctor + validate
npm test
npm run doctor
npm run validate
```

- [CONTRIBUTING.md](./CONTRIBUTING.md)  
- [CHANGELOG.md](./CHANGELOG.md)  
- [docs/contract.md](./docs/contract.md)  
- [docs/omo-gap.md](./docs/omo-gap.md) — omo capability map (shipped / blocked)  
- **CI:** `npm run ci` ([`scripts/ci.mjs`](./scripts/ci.mjs)). Actions template: [`docs/ci.workflow.yml`](./docs/ci.workflow.yml)

---

## Configuration (optional)

```bash
mkdir -p .omg
cp docs/config.example.json .omg/config.json
```

Flags: `hashline`, `skillGate`, `agentGuard`, `commentChecker`, `diagCommand`, `maxRalphIter`.  
Env: `OMG_SKILL_GATE`, `OMG_HASHLINE`, `OMG_AGENT_GUARD`, `OMG_COMMENT_CHECKER`, `OMG_DIAG_CMD`, …

---

## Optional enhancements (MCP)

oh-my-grok does **not** ship an in-plugin LSP/AST tool suite (see the non-goal in [omo-gap](./docs/omo-gap.md)), but it interoperates with external MCPs. Two tiers by whether they ship with the plugin:

**Ships with the plugin**

- **context7** — official library docs ([upstash/context7](https://github.com/upstash/context7)). Already enabled in [.mcp.json](./.mcp.json) (`disabled: false`, npm package `@upstash/context7-mcp`) — **loaded on plugin install, no manual setup**.

**Advanced / optional (not Grok-native, opt-in)**

External stdio MCPs by the oh-my-openagent author [code-yeongyu](https://github.com/code-yeongyu). They do **not** ship with this plugin, require manual `grok mcp add`, and are not designed for Grok Build natively:

- **lsp-tools-mcp** ([code-yeongyu/lsp-tools-mcp](https://github.com/code-yeongyu/lsp-tools-mcp)) — LSP diagnostics bridge (extracted from codex-lsp / omo). ⚠️ Known Windows startup defect ([oh-my-openagent #4262](https://github.com/code-yeongyu/oh-my-openagent/issues/4262)); under Grok Build you must register the server name manually.
- **ast-grep-skill** ([code-yeongyu/ast-grep-skill](https://github.com/code-yeongyu/ast-grep-skill)) — LLM-neutral AST search/rewrite skill (25 languages, wraps `ast-grep`).

> These external MCPs are **not** built-in capabilities of oh-my-grok; they are optional "plug in an existing external server" enhancements, consistent with this repo's LSP/AST non-goal.

---

## Architecture (short)

```
hooks/hooks.json → node dist/cli.js <event>
  → protocol → events → features (ralph, skill-gate, hashline, …)
  → .omg/ workspace state + session skill catalog
```

Hard rules: one registration per hook event; fail-open on unexpected errors; Windows uses `node dist/cli.js` (no bash launcher).

---

## License

[MIT](./LICENSE)

- Superpowers skills: [obra/superpowers](https://github.com/obra/superpowers) MIT  
- Not affiliated with xAI
