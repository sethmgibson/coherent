---
name: coherent
description: "Cursor adapter for Coherent. Use for init, audit, inspect, baseline, plan, fix next, check, install, or update on a backend or large AI-built codebase. Canonical methodology lives in skills/coherent/. Not for frontend visual design."
argument-hint: "[init|refresh|audit|inspect|review|baseline|check|plan|fix|doctor|install|update] [target]"
---

<!-- coherent:adapter -->
This is a Cursor bootstrap adapter, not a second methodology. First run `coherent version . --json`. Load the exact file reported at `runtime.skillPath` and follow its references. If the command, `canonical-skill-path` capability, or reported file is missing, stop and repair the CLI/skill installation before auditing or writing Coherent state.

In chat, invoke commands as `/coherent init`, `/coherent refresh`, `/coherent audit`, `/coherent inspect`, `/coherent review`, `/coherent baseline`, `/coherent plan`, `/coherent fix next`, `/coherent check`, `/coherent doctor`, `/coherent install`, and `/coherent update`. `/backend` is a skill alias for the same commands.

The CLI binary is `coherent`. `backend` is an alias.

Routing:

- **No argument:** recommend `init` if `.coherent/ARCHITECTURE.md` is missing; otherwise recommend `audit`.
- **Explicit command:** open the matching playbook relative to the reported canonical skill path.
- **Ordinary feature work:** load `reference/prevention.md` beside the canonical skill. Prefer `coherent check --changed` after edits.
- **Taxonomy:** load `reference/taxonomy.md` beside the canonical skill (generated from `src/catalog/rules.ts`).

If you install a project rule, copy `adapters/cursor/prevention.mdc` rather than rewriting the methodology here.
<!-- /coherent:adapter -->
