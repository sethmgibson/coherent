---
name: coherent
description: "Cursor adapter for Coherent's conversational maintainability review. Inspect one problem class, offer fixes, and suggest the next. Accepts focused audits and fix requests. Not for frontend visual design."
argument-hint: "[optional focus or fix request]"
---

<!-- coherent:adapter -->
This is a Cursor bootstrap adapter. Prefer skills-only adoption, which copies
the complete canonical skill and needs no CLI or project dependency.
Use the installed canonical skill directly when available. Otherwise, when a
CLI is available, run `coherent version . --json` and load `runtime.skillPath`.
Follow its conversational review workflow. If neither is available, use existing
project context to review whole-system simplification: infer required outcomes
and consider a smaller complete workflow before detailed cleanup. Report
proposals before editing, and offer deeper investigation, fixes, or an
architecture fossilization review. Honor focused requests directly; this
opening review is not a prerequisite. Do not require
baseline/review state or install dependencies incidentally. Verify the actual
runtime capabilities before mechanical tool calls or advanced state writes.

Project adoption for the default skill:
`npx --yes --package github:sethmgibson/coherent -- coherent install --skills-only --yes`.
Persistent reviews and baseline gates remain explicit advanced
choices. `/backend` remains a compatibility alias.
<!-- /coherent:adapter -->
