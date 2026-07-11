# Changelog

All notable changes to this project are documented here.

## [0.4.0] — 2026-07-11

### Added

- **Agent Guard** — hard-deny Write/Edit/Delete for read-only roles (`oracle`, `explore`, `librarian`, `metis`, `momus`)
- **Comment Checker** — detect AI-slop narration comments; soft warn by default, optional hard deny
- **Category thin layer** — visual / deep / ultrabrain / quick / writing banners for delegation guidance
- **`/init-deep`** — hierarchical `AGENTS.md` generation + skill
- **Metis / Momus** agents — plan gap analysis and plan review (read-only)
- **Hashline PostTool inject** — LINE#ID annotated preview after Read; nearby AGENTS.md directory inject
- **`npm run doctor`** — health check for hooks, agents, skills, dist
- Plan-mode copy requires Metis → Momus review chain before `/start-work`

### Changed

- PreTool order: Agent Guard → plan-mode → Hashline → Comment Checker → Skill Gate
- Hard orchestration banner and Sisyphus bootstrap list Metis/Momus and categories
- Plugin/package version **0.4.0**

### Docs / OSS

- Star-ready README (problem → install → wow path → honest omo comparison)
- CONTRIBUTING, CHANGELOG, GitHub Actions CI

## [0.3.0] — 2026-07-11

### Added

- **ULW v2** — mid-sentence `ulw`/`ultrawork`, phase machine explore→implement→verify, DONE evidence gate, stall detection, progress logs under `.omg/ulw-loop/`
- Discipline agents (Sisyphus team) as plugin agents
- Hashline PreTool guard (fresh Read, stale `old_string`, LINE#ID validation)
- Diagnostics soft/hard stop, hard orchestration injection
- Superpowers vendor + Skill Gate catalog over plugin + vendor skills

### Harness spine (earlier)

- Ralph loop, Todo mirror + enforcer, Boulder, Prometheus plan-mode, IntentGate, Handoff, rules injection, fail-open CLI

## [0.2.x] / earlier

Internal scaffolding: protocol golden tests, SessionStart fingerprint, UserPrompt merge, Windows `node dist/cli.js` entry.
