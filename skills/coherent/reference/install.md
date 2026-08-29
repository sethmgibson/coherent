# `install` / `update`

Copy the Cursor adapter into a repository. Provider generation beyond Cursor is out of scope.

```bash
coherent install
coherent install --no-rule
coherent install --no-hooks
coherent update
```

`install` and `update` share the same copy rules. Missing files are written. Known adapter stubs and `<!-- coherent:adapter -->` / `<!-- coherent:prevention -->` interiors are refreshed. User edits outside those fences are left alone.

## What is written

- `.cursor/skills/coherent/SKILL.md` — thin adapter that points at `skills/coherent/` in the package
- `.cursor/skills/backend/SKILL.md` — `/backend` alias adapter
- `.cursor/rules/backend-prevention.mdc` — unless `--no-rule`
- `.cursor/hooks/coherent-check.sh` and a `stop` entry in `.cursor/hooks.json` — unless `--no-hooks`
- `.git/hooks/pre-commit` — when `.git` is a directory and no foreign hook is present

The hook runs `coherent check --changed`. Full `audit` stays explicit.

The adapter is not a second methodology. Load `skills/coherent/SKILL.md` from the installed package.
