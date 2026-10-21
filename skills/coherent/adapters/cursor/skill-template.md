---
name: coherent
description: "Cursor adapter for Coherent. Use for init, audit, inspect, baseline, plan, fix next, check, install, or update on a backend or large AI-built codebase. Canonical methodology lives in skills/coherent/. Not for frontend visual design."
argument-hint: "[init|refresh|audit|inspect|review|baseline|check|plan|fix|doctor|install|update] [target]"
---

<!-- coherent:adapter -->
This is a Cursor bootstrap adapter. Prefer skills-only adoption, which copies
the complete canonical skill and needs no CLI or project dependency.
When a CLI is available, run `coherent version . --json`, load the exact file
at `runtime.skillPath`, and follow its bounded default workflow. If it is
unavailable, use existing project context for source inspection; do not require
baseline/review state or install dependencies incidentally. Verify the actual
runtime capabilities before mechanical tool calls or advanced state writes.

Project adoption for the default skill:
`npx --yes --package github:sethmgibson/coherent -- coherent install --skills-only --yes`.
Persistent reviews, baseline gates and managed cleanup remain explicit advanced
choices. `/backend` remains a compatibility alias.
<!-- /coherent:adapter -->
