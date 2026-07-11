# oh-my-grok

[![CI](https://github.com/Kyou12138/oh-my-grok/actions/workflows/ci.yml/badge.svg)](https://github.com/Kyou12138/oh-my-grok/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![Grok Build](https://img.shields.io/badge/Grok%20Build-plugin-111827)](https://x.ai)

**omo-style agent harness + Superpowers methodology for [Grok Build](https://x.ai).**

Install once. Type `ultrawork`. Hooks force the agent to explore → implement → verify until the work is actually done.

> **Repo:** https://github.com/Kyou12138/oh-my-grok  
> **Requires:** Grok Build CLI + Node.js 20+  
> Community plugin — **not** an xAI product. “Grok” is a trademark of xAI.

**中文简介：** Vanilla Grok 很强，但长任务容易半途停、不读 skill、stale 编辑。oh-my-grok 用 hooks **强制** Ralph/ULW 循环、Skill Gate、Hashline 与 Stop 续跑，并内置 [obra/superpowers](https://github.com/obra/superpowers) 工程方法论。

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
grok plugin install github.com/Kyou12138/oh-my-grok --trust
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

> **Do not dual-enable** [mihazs/oh-my-grok](https://github.com/mihazs/oh-my-grok) — same plugin name / `.omg/` state will conflict.

---

## Wow path (copy-paste)

### 1) Ultrawork — work until verified

In a Grok chat:

```text
ultrawork fix the failing tests and don't stop until green
```

**What the harness does (real behavior, covered by tests):**

1. Starts a **ULW loop** (phase machine: `explore → implement → verify`)
2. On **Stop**, if work is incomplete → **blocks** and continues the agent
3. Rejects bare `<promise>DONE</promise>` without explore/implement evidence + verification
4. Prefer: `<promise>VERIFIED</promise>` then `<promise>DONE</promise>`

Also works mid-sentence: `please ulw refactor the auth module`.

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

Activates **boulder** execution (Atlas/Sisyphus). Optional review agents: **Metis** (gaps), **Momus** (plan quality) — both read-only.

---

## What you get

| Layer | Ships today |
|-------|-------------|
| **Harness** | Ralph / **ULW v2**, Skill Gate, Hashline, Stop chain, Todo/Boulder, IntentGate, Prometheus, Comment Checker, Agent Guard, Categories, Diagnostics, Handoff, `/init-deep` |
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

## Commands

| Command | Effect |
|---------|--------|
| `ultrawork` / `ulw` / `/ulw-loop` | ULW loop (explore → implement → verify) |
| `/ralph-loop "…"` | Work-until-done loop |
| `/cancel-ralph` | Clear loop |
| `/plan` · `/prometheus` | Plan mode (writes only `.omg/plans/`) |
| `/start-work` | Boulder from plan |
| `/handoff` | Session handoff under `.omg/handoffs/` |
| `/init-deep` | Hierarchical `AGENTS.md` |
| `/stop-continuation` · `/resume-continuation` | Pause / resume auto-continue |

| Marker | Meaning |
|--------|---------|
| `<promise>VERIFIED</promise>` | Verification passed — preferred before DONE on ULW |
| `<promise>DONE</promise>` | Task complete (ULW requires evidence gate) |

---

## Trust & health

```bash
npm install
npm test              # unit + harness golden paths
npm run doctor        # hooks / agents / skills healthy
npm run validate      # plugin layout
```

- [CONTRIBUTING.md](./CONTRIBUTING.md) — how to help  
- [CHANGELOG.md](./CHANGELOG.md) — versioned release notes  
- [docs/contract.md](./docs/contract.md) — hook I/O contract  
- CI runs `npm test`, `doctor`, and `validate` on every push/PR

---

## Configuration (optional)

```bash
mkdir -p .omg
cp docs/config.example.json .omg/config.json
```

Key flags: `hashline`, `skillGate`, `agentGuard`, `commentChecker`, `diagCommand`, `maxRalphIter`.  
Env overrides: `OMG_SKILL_GATE`, `OMG_HASHLINE`, `OMG_AGENT_GUARD`, `OMG_COMMENT_CHECKER`, `OMG_DIAG_CMD`, …

---

## Architecture (short)

```
hooks/hooks.json → node dist/cli.js <event>
  → protocol → events → features (ralph, skill-gate, hashline, …)
  → .omg/ workspace state + session skill catalog
```

Hard rules for contributors: one registration per hook event; fail-open on unexpected errors; Windows uses `node dist/cli.js` (no bash launcher).

---

## License

[MIT](./LICENSE)

- Superpowers skills: [obra/superpowers](https://github.com/obra/superpowers) MIT  
- Not affiliated with xAI
