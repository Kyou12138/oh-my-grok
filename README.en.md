# oh-my-grok

[![CI](https://img.shields.io/badge/CI-npm%20run%20ci-brightgreen)](./scripts/ci.mjs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![Grok Build](https://img.shields.io/badge/Grok%20Build-plugin-111827)](https://x.ai)
[![Tests](https://img.shields.io/badge/tests-vitest-blue)](./CONTRIBUTING.md)

[中文](./README.md) | **English**

**Discipline harness for [Grok Build](https://x.ai) (Harness Light) + Superpowers.** · **v1.1.42**

> **Hard PreTool gates + agents/skills discipline** — not full OpenCode omo.  
> **Host truth is [docs/contract.md](./docs/contract.md)** (today only PreToolUse can hard-block tools).

Install once → `npm run doctor` healthy → blind edits get an immediate **PreTool deny**. Hard paths are demoable; Stop only writes state — we do **not** claim host auto-yank.

> **Repo:** https://github.com/Kyou12138/oh-my-grok  
> **Requires:** Grok Build CLI + Node.js 20+  
> Community plugin — **not** an xAI product. “Grok” is a trademark of xAI.  
> ⚠️ **Do not dual-enable with [mihazs/oh-my-grok](https://github.com/mihazs/oh-my-grok)** (name + `.omg` clash).

---

## The problem

Vanilla Grok Build is strong. Long tasks still drift:

| Failure mode | Without a harness |
|--------------|-------------------|
| Blind edits | Write without reading file/skills |
| Plan leaks | Mutates `src/` while “planning” |
| Role escape | Read-only specialists still edit |
| Fake done | Open todos / plan claimed finished |

**oh-my-grok** = **Grok discipline plugin**:

| Channel | Real effect on Grok Build today |
|---------|----------------------------------|
| **PreToolUse** | **Only hard enforce** — deny tool calls (Hashline, plan lock, Agent Guard, Skill Gate, diag hard, spawn recovery, …) |
| **PostTool / Stop** | Writes `.omg` / session state; **stdout discarded** by host — no guaranteed auto-continue |
| **SessionStart / skills / agents** | Inject discipline context; handoff / resume summaries |

KPI: **hard-gate reliability + install conversion**, not omo-issue close counts. Semantics align with omo; product peer is **Codex Light**, not Ultimate feature parity.

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

Open a **new** Grok session (or reload Hooks).

**60-second check:**

```bash
npm run doctor    # expect RESULT: healthy
```

Live probe: `search_replace` / Write an **existing** file **without** a prior `read_file` → expect **PreTool deny** (Hashline).

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

## Wow path (30s hard feel)

### 1) Blind edit denied (PreTool — demo this first)

1. Pick an **existing** source path  
2. **Skip** `read_file`  
3. Call `search_replace` / Write  
4. Expect: **tool deny**, Hashline / Read-first reason  

Best GIF-worthy path after install.

### 2) Plan-mode path lock

```text
/plan "add OAuth to login"
```

Writing under `src/` while plan-mode is active → **PreTool deny**; only `.omg/plans/` is allowed.

```text
/start-work
```

Requires plan review (`## Review` Metis/Momus or `VERDICT: PASS`) **and** labeled task checkboxes — else blocked. Arms **boulder** + optional todo seed.

### 3) Ultrawork state machine (honest)

```text
ultrawork fix the failing tests and don't stop until green
```

| Behavior | Host hard-enforce? |
|----------|-------------------|
| ULW phases `explore → implement → verify` | State in `.omg` |
| Fake DONE / `not ULW_DONE` hedges | State machine rejects (tested) |
| `npm test` credits verify | PostTool state |
| **Stop auto-yank / re-prompt** | **No** — Grok discards Stop stdout; next PreTool / SessionStart resume reads state |

Cancel: `/cancel-ralph`. Pause plugin-side gates: `/stop-continuation` (not host force-reprompt).

Mid-sentence: `please ulw refactor the auth module`.

---

## What you get

| Layer | Ships today | Hard enforce? |
|-------|-------------|---------------|
| **PreTool gates** | Hashline, plan lock, Agent Guard, Skill Gate, diag hard, category-discipline, spawn follow-through PreTool | **Yes** |
| **State machine / soft** | Ralph·ULW, Todo/Boulder, idle detect, Stop chain, SessionStart resume, Handoff | Writes `.omg`; Stop **≠** host continue |
| **Discipline agents** | Sisyphus · Hephaestus · Prometheus · Atlas · Oracle · Explore · Librarian · Metis · Momus | Roles + PreTool guard |
| **Superpowers** | Vendored MIT skills + Skill Gate | Intent + PreTool |

### Honest comparison (three columns)

| | Vanilla Grok | **oh-my-grok** | omo Ultimate / Codex Light |
|--|--------------|----------------|----------------------------|
| Host | Grok Build | **Grok Build** | OpenCode · Codex |
| **Hard tool deny (PreTool)** | No plugin gates | **Yes** (main arena) | Yes (wider hook surface) |
| Stop / idle **auto-continue** | No | **State machine only** (host-limited) | Ultimate can session.prompt-level continue |
| Superpowers / skills | Optional | **Bundled + Gate** | Separate / partial |
| Multi-model routing | Host | **non-goal** | Ultimate |
| Team Mode / tmux | — | **non-goal** | Ultimate |
| Peer product tier | — | **≈ Codex Light discipline** | Ultimate = full OS |

We **align harness semantics** with omo; KPI is **hard-gate reliability**, not 54+ hooks or Ultimate parity. See [docs/omo-gap.md](./docs/omo-gap.md).

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
| `/stop-continuation` · `/resume-continuation` | Pause / resume **plugin-side** gate & state logic |

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
- [docs/contract.md](./docs/contract.md) — **authoritative host contract**; README promises ⊆ this file  
- [docs/omo-gap.md](./docs/omo-gap.md) — Vanilla / omg / omo map  
- [docs/acceptance.md](./docs/acceptance.md) — L0 unit · L2 live PreTool  
- [docs/install-60s.md](./docs/install-60s.md) — 60s install + troubleshooting  
- [docs/harness-light-architecture.md](./docs/harness-light-architecture.md) — target core/adapter layout  
- [docs/grok-build-source.md](./docs/grok-build-source.md) — grok-build source notes  
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
