# `install` / `update`

Install optional Cursor or Git integrations. Coherent itself works without this
command. Codex loads the provider-neutral skill through the standard skill
installer or a repo-scoped `.agents/skills/coherent` adapter, so it does not
need a generated editor integration here. Provider-specific generation beyond
Cursor is out of scope.

## Adoption preflight

Skill discovery and CLI installation are separate. Inspect existing personal,
shared, and project skill locations and symlink targets before adding copies.
A successful installer registration does not justify another manual copy.
Use the project-installed package's canonical playbook when it differs from
a global skill, and record the package version and lockfile Git revision when
diagnosing a run; a version string alone may identify several Git builds.

Before adding a Git dependency to a shared manifest/lockfile, check whether
the source is private and whether CI, deployment builds, and containers can
fetch it. Local credentials are not evidence of remote access. Explain any
missing access before the change, never put credentials in a manifest or
lockfile, and do not claim shared adoption is complete without that check.
If access is unavailable, keep the shared dependency unchanged and use an
existing separate Coherent checkout with an explicit target root for the
local audit (`node /absolute/path/to/coherent/dist/cli.js inspect /target/repo`).
Optional hooks still need a CLI available in their execution environment.

```bash
coherent install
coherent install --adapter
coherent install --rule --cursor-hook
coherent install --git-hook
coherent update --rule
```

With no flags, `install` and `update` write nothing. `coherent update` refreshes
selected integration files only; it does **not** update the CLI dependency or
lockfile. They share the same safe copy rules when an integration is explicitly selected: missing files are written, known adapter stubs and managed fence interiors are refreshed, and user edits outside those fences are left alone.

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

The packaged Cursor adapter source is
`skills/coherent/adapters/cursor/skill-template.md`, intentionally not named
`SKILL.md` so recursive Codex discovery does not register it as another skill.
