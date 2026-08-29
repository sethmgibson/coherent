---
name: coherent
description: "Cursor adapter for Coherent. Use for init, audit, baseline, plan, fix next, check, install, or update on a backend or large AI-built codebase. Canonical methodology lives in skills/coherent/. Not for frontend visual design."
argument-hint: "[init|refresh|audit|review|baseline|check|plan|fix|doctor|install|update] [target]"
---

<!-- coherent:adapter -->
This is a Cursor adapter. The canonical skill is `skills/coherent/SKILL.md`. Load that file and its references. Do not treat this adapter as a second methodology.

In chat, invoke commands as `/coherent init`, `/coherent refresh`, `/coherent audit`, `/coherent review`, `/coherent baseline`, `/coherent plan`, `/coherent fix next`, `/coherent check`, `/coherent doctor`, `/coherent install`, and `/coherent update`. `/backend` is a skill alias for the same commands.

The CLI binary is `coherent`. `backend` is an alias.

Routing:

- **No argument:** recommend `init` if `.coherent/ARCHITECTURE.md` is missing; otherwise recommend `audit`.
- **Explicit command:** open the matching playbook under `skills/coherent/reference/`.
- **Ordinary feature work:** `reference/prevention.md`. Prefer `coherent check --changed` after edits.
- **Taxonomy:** `reference/taxonomy.md` (generated from `src/catalog/rules.ts`).

If you install a project rule, copy `adapters/cursor/prevention.mdc` rather than rewriting the methodology here.
<!-- /coherent:adapter -->
