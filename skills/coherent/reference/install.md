# `install` / `update`

Install Codex and Cursor skill files, and optional Cursor or Git integrations.
The unscoped npm name `coherent` belongs to a different package, so the public
launcher is a GitHub package specifier, not `npx coherent`.

```bash
npx --yes --package github:sethmgibson/coherent -- coherent install
npm exec --yes --package github:sethmgibson/coherent -- coherent install
```

`--yes` skips prompts and uses detected harnesses, or both Codex and Cursor when
nothing is detected, and installs into the current project. Scripts can pass
the same choices explicitly:

```bash
npx --yes --package github:sethmgibson/coherent -- coherent install --providers=codex,cursor --scope=project --yes
```

That project-scope command is complete: it installs `github:sethmgibson/coherent`
through the detected package manager (`pnpm`, `npm`, `yarn`, or `bun`) using
fixed argv, updates the matching lockfile and `node_modules`, verifies the
project-local `coherent version` handshake, then copies the skill tree. A failed
package-manager install or handshake does not copy skill files. No second
`pnpm add` / `npm install` step is required.

A TTY asks which detected harnesses to keep and whether to install into the
project or globally. A non-TTY never waits for input: without `--yes`,
`--providers`, or `--scope`, `install` and `update` write nothing unless an
explicit integration flag is set.

Global scope copies skill files under the user home directory. It does **not**
install the Coherent CLI or put `coherent` on `PATH`. Add
`github:sethmgibson/coherent` to each project, or run commands through the
`npm exec --package github:sethmgibson/coherent` launcher.

Project scope copies the packaged skill tree so relative references such as
`reference/taxonomy.md` keep working. If `package.json` already declares a
different `coherent` package, including a similarly prefixed GitHub name,
adoption fails with a conflict instead of overwriting it. A same-repo pin such
as `github:sethmgibson/coherent#<rev>` is kept. Malformed `package.json` also
fails project adoption. Unusual
CI or global-CLI setups can pass `--skills-only` to copy skill files without
installing the project CLI. The copied skill and the project CLI stay
compatible through `coherent version` / `runtime.skillPath`. Reload Codex or
Cursor, then run `$coherent init` or `/coherent init`.

## Adoption preflight

Inspect existing personal, shared, and project skill locations and symlink
targets before adding copies. A successful installer registration does not
justify another manual copy. Use the project-installed package's canonical
playbook when it differs from a global skill, and record the package version
and lockfile Git revision when diagnosing a run; a version string alone may
identify several Git builds.

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
coherent install --yes
coherent install --providers=codex,cursor --scope=project --yes
coherent install --skills-only --yes
coherent install --adapter
coherent install --rule --cursor-hook
coherent install --git-hook
coherent update --providers=codex,cursor --yes
```

With no flags, non-TTY `install` and `update` write nothing. `coherent update`
refreshes selected integration and skill files only; it does **not** update the
CLI dependency or lockfile. They share the same safe copy rules: missing files
are written, generated reference files and known adapter stubs are refreshed,
and user edits outside those cases are left alone.

## What is written

- `--providers=codex` / detected Codex → `.agents/skills/coherent/` (the packaged skill tree)
- `--providers=cursor` / detected Cursor → `.cursor/skills/coherent/` (the packaged skill tree)
- `--scope=global` writes those trees under the user home instead of the project
- project scope installs `github:sethmgibson/coherent` with the detected package manager, verifies `node_modules/.bin/coherent version`, then copies the skill tree
- `--skills-only` copies skill files and skips the project CLI install
- `--adapter` → `.cursor/skills/coherent/SKILL.md` (handshake adapter; skipped when project Cursor adoption will write the skill tree, or if a full skill tree is already present as user content)
- `--alias` → `.cursor/skills/backend/SKILL.md`, the legacy `/backend` alias
- `--rule` → `.cursor/rules/backend-prevention.mdc`
- `--cursor-hook` → `.cursor/hooks/coherent-check.sh` and a `stop` entry in `.cursor/hooks.json`
- `--git-hook` → `.git/hooks/pre-commit` when `.git` is a directory and no foreign hook is present

Hooks run `coherent check --changed` only after a baseline exists. Full `audit` stays explicit. Malformed `hooks.json` is skipped, not overwritten. Malformed `package.json` fails project CLI adoption rather than reporting success. Unrelated hook entries stay.

The Cursor handshake adapter is not a second methodology. It runs
`coherent version . --json` and loads the exact canonical file reported at
`runtime.skillPath`. Project copies of the packaged skill keep their
`reference/` relatives next to `SKILL.md`. The checked-in Codex adapter at
`.agents/skills/coherent/SKILL.md` in this repository follows the same
canonical methodology through a source-relative path that is valid only here.

The packaged Cursor adapter source is
`skills/coherent/adapters/cursor/skill-template.md`, intentionally not named
`SKILL.md` so recursive Codex discovery does not register it as another skill.
