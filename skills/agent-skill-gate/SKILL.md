---
name: agent-skill-gate
description: Meta-skill — how oh-my-grok Skill Gate works. Read this (or any relevant skill) before mutating files.
user_invocable: true
---

# Agent Skill Gate

Mutating tools (Write / StrReplace / Edit / Delete) are **denied** until at least one catalog `SKILL.md` has been **Read** this session.

## Workflow

1. Identify the work type (implement, debug, plan, review…).
2. `Read` the matching skill under plugin `skills/` or `vendor/superpowers/skills/`.
3. Announce: `Using <skill-name> to <purpose>`.
4. Proceed with edits.

## Fail-open

If the skill catalog is empty, edits are allowed (broken install should not lock the repo).
