# `install` / `update`

Install optional Cursor or Git integrations. Coherent itself works without this
command. Codex loads the provider-neutral skill through the standard skill
installer or a repo-scoped `.agents/skills/coherent` adapter, so it does not
need a generated editor integration here. Provider-specific generation beyond
Cursor is out of scope.

```bash
coherent install
coherent install --adapter
coherent install --rule --cursor-hook
coherent install --git-hook
coherent update --rule
```

With no flags, `install` and `update` write nothing. They share the same safe copy rules when an integration is explicitly selected: missing files are written, known adapter stubs and managed fence interiors are refreshed, and user edits outside those fences are left alone.

## What is written

- `--adapter` → `.cursor/skills/coherent/SKILL.md`
- `--alias` → `.cursor/skills/backend/SKILL.md`, the legacy `/backend` alias
- `--rule` → `.cursor/rules/backend-prevention.mdc`
- `--cursor-hook` → `.cursor/hooks/coherent-check.sh` and a `stop` entry in `.cursor/hooks.json`
- `--git-hook` → `.git/hooks/pre-commit` when `.git` is a directory and no foreign hook is present

Hooks run `coherent check --changed` only after a baseline exists. Full `audit` stays explicit.

The Cursor adapter is not a second methodology. Load
`skills/coherent/SKILL.md` from the installed package. The checked-in Codex
adapter at `.agents/skills/coherent/SKILL.md` follows the same rule.
