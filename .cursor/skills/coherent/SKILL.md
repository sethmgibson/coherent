---
name: coherent
description: "Find and fix maintainability problems in backend and large AI-built codebases. A bare coherent request starts a conversational review; offer fixes and the next problem class. Not for frontend visual design."
argument-hint: "[optional focus or fix request]"
---

<!-- coherent:adapter -->
This is the Cursor repository discovery adapter. Read the canonical skill at
`../../../skills/coherent/SKILL.md` and follow its conversational review workflow.
The CLI is optional. When using an installed CLI, `coherent version . --json`
reports `runtime.skillPath`; load that exact canonical skill before tool work.
Missing CLI support does not block source inspection or require state setup.
Use skills-only adoption for consumer projects; do not copy this source-relative
adapter into them. Persistent reviews, baseline gates and managed cleanup are
explicit advanced choices.
<!-- /coherent:adapter -->
