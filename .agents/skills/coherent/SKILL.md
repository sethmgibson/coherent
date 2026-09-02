---
name: coherent
description: "Use when the user wants maintainability work on a backend or large AI-built codebase: initialize architecture context, audit entropy, plan cleanup, fix the next safe cleanup, check new drift, or record a baseline. Not for frontend visual design."
---

<!-- coherent:adapter -->
This is the Codex repository adapter. The canonical, provider-neutral skill is:

`../../../skills/coherent/SKILL.md`

Read that file completely before taking action, then load only the reference it
names for the requested command. Do not invent a second methodology here.

In Codex, invoke this skill as `$coherent`. The CLI command remains `coherent`.
Consumer projects should run `npx --yes --package github:sethmgibson/coherent -- coherent install` rather than copying this source-relative adapter.
<!-- /coherent:adapter -->
