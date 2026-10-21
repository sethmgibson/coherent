---
name: coherent
description: "Use when the user wants Impeccable-style maintainability work on a backend or large AI-built codebase: make bounded improvements with targeted evidence and agent judgment. Persistent cleanup is optional. Not for frontend visual design."
argument-hint: "[init|refresh|audit|inspect|review|baseline|check|plan|fix|doctor|install|update] [target]"
---

<!-- coherent:adapter -->
This is the Cursor repository discovery adapter. Read the canonical skill at
`../../../skills/coherent/SKILL.md` and follow its bounded default workflow.
The CLI is optional. When using an installed CLI, `coherent version . --json`
reports `runtime.skillPath`; load that exact canonical skill before tool work.
Missing CLI support does not block source inspection or require state setup.
Use skills-only adoption for consumer projects; do not copy this source-relative
adapter into them. Persistent reviews, baseline gates and managed cleanup are
explicit advanced choices.
<!-- /coherent:adapter -->
