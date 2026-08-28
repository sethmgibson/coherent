---
name: backend
description: "Cursor adapter for Coherent backend maintainability. Use for init, audit, baseline, plan, fix next, or check on a backend or large AI-built codebase. Canonical methodology lives in skills/backend-maintainability/. Not for frontend visual design."
argument-hint: "[init|audit|baseline|check|plan|fix] [target]"
---

This is a Cursor adapter. The canonical skill is `skills/backend-maintainability/SKILL.md`. Load that file and its references. Do not treat this adapter as a second methodology.

In chat, invoke commands as `/backend init`, `/backend audit`, `/backend baseline`, `/backend plan`, `/backend fix next`, and `/backend check`.

The CLI binary is `coherent`. `backend` is an alias.

Routing:

- **No argument:** recommend `init` if `.backend/ARCHITECTURE.md` is missing; otherwise recommend `audit`.
- **Explicit command:** open the matching playbook under `skills/backend-maintainability/reference/`.
- **Ordinary feature work:** `reference/prevention.md`.
- **Taxonomy:** `reference/taxonomy.md` (generated from `src/catalog/rules.ts`).

If you install a project rule, copy `adapters/cursor/prevention.mdc` rather than rewriting the methodology here.
