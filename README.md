# Coherent

Maintainability guidance and tooling for backend and large AI-built codebases.

Coherent helps a coding agent understand the architecture that is actually in use, find code and concepts that have drifted, choose a safe cleanup order, and keep new work from adding more debt.

> Quick start: from your project root run
> `npx --yes --package github:sethmgibson/coherent -- coherent install`,
> reload Codex or Cursor, then invoke `$coherent init` or `/coherent init`.

## Install

Requires Node.js 20+. The unscoped npm name `coherent` is a different package,
so do not run `npx coherent`. From the project root:

```bash
npx --yes --package github:sethmgibson/coherent -- coherent install
```

That is the same as `npm exec --yes --package github:sethmgibson/coherent -- coherent install`.
The installer detects Codex (`.agents`, `.codex`, `~/.codex`, or `codex` on
`PATH`) and Cursor (`.cursor`, `~/.cursor`, or `cursor` on `PATH`). A TTY asks
which harnesses to keep and whether to install into the project or globally.
Scripts can skip prompts:

```bash
npx --yes --package github:sethmgibson/coherent -- coherent install --providers=codex,cursor --scope=project --yes
```

Project scope copies the packaged skill tree (so `reference/` links keep
working) and installs `github:sethmgibson/coherent` with the detected package
manager (`pnpm`, `npm`, `yarn`, or `bun`) so `package.json`, the lockfile, and
`node_modules` are updated in that same command. It then verifies the
project-local `coherent version` handshake. See the
[adoption preflight](skills/coherent/reference/install.md#adoption-preflight)
before CI or containers fetch GitHub. Unusual CI or global-CLI setups can pass
`--skills-only` to copy skill files without installing the project CLI.
Global scope copies skill files under your home directory and does not put
the CLI on `PATH`.

Reload Codex or Cursor so it discovers the skill, then run `$coherent init` or
`/coherent init`. Optional Cursor rules, the `/backend` alias, and
`check --changed` hooks stay opt-in: `coherent install --rule`, `--alias`,
`--cursor-hook`, or `--git-hook`.

## Use it

Start with three skill requests. Codex uses `$coherent`; Cursor uses
`/coherent`:

```text
$coherent init
$coherent audit
$coherent fix next
```

For a whole-repository cleanup, ask `$coherent` to run the full cleanup. It
will review and fix one DAG node at a time until no safe work remains; it does
not literally run optional integration commands.

Unused-export candidates require review before `fix next` can select them.
If no node is ready, the full workflow continues investigating candidates;
zero ready nodes does not mean the repository is clean.

Dead-code checks also surface helpers used only by tests, and recognize
explicit Nest provider bindings and registered handlers. Unknown dynamic
reachability remains a review question, never automatic deletion evidence.

The cleanup loop uses one combined inspection command so audit, planning, and
next-node selection share the same scan:

```text
$coherent inspect
```

Before a full cleanup, the packaged skill runs a machine-checked `coherent
version --json` preflight. It stops when the CLI is missing the workflow,
detector revision, or capabilities required by the skill, and reports the
resolved package path and lockfile Git revision when available.

- `init` records the repository's living architecture so later work has context.
- `audit` finds maintainability problems without changing code or writing project files.
- `fix next` chooses one safe, unblocked cleanup instead of rewriting the repository wholesale.

For an existing codebase, record today's debt once so future changes can be judged separately:

```text
$coherent baseline
```

After ordinary feature work, check only what changed:

```text
$coherent check --changed
```

The CLI is also available through the project-local package:

```bash
pnpm coherent init
pnpm coherent audit
pnpm coherent check --changed
```

## What Coherent looks for

Coherent focuses on the kinds of entropy that accumulate when a codebase is changed repeatedly by people and agents:

- dead code and stale compatibility paths
- duplicate implementations and representations
- terminology drift and implicit string protocols
- unnecessary layers, wrappers, helpers, and abstractions
- fragile state, error-handling, test, dependency, and performance patterns

Some findings can be proven mechanically. Others require judgment about meaning, ownership, or intent. Coherent keeps that distinction visible: a valid result can be “these look similar, but they are intentionally different.”

## Commands

| Command | What it does |
|---|---|
| `coherent version` | Identify the exact CLI runtime and verify skill compatibility |
| `$coherent init` | Inventory the repository and create durable architecture context |
| `$coherent refresh` | Refresh discovered facts without overwriting confirmed architecture notes |
| `$coherent audit` | Run deterministic checks and guide semantic investigation |
| `$coherent inspect` | Audit once, build the reviewed plan, and show the next cleanup node |
| `$coherent review` | Confirm, dismiss, defer, batch, or preview/prune obsolete reviews |
| `$coherent baseline` | Record existing debt so it does not block adoption |
| `$coherent plan` | Build a dependency-aware cleanup plan |
| `$coherent fix next` | Select one safe, unblocked cleanup |
| `$coherent check --changed` | Report new and resolved debt in the current change |
| `$coherent doctor` | Check worktree integrity; add `--staged` or `--ref HEAD` to validate the exact Git artifact and `--deep` to rescan reviews |

In Codex, mention `$coherent` without a command to get the recommended next
step. In Cursor, use `/coherent` for the same requests.

## How cleanup is ordered

Coherent does not ask you to memorize a numbered cleanup checklist.

Each finding has a readable name, such as **Dead code**, **Stale compatibility**, or **Duplicate representations**. The planner then orders actual findings by prerequisites, confidence, risk, and how much later work they unlock. Default cleanup stages are used only when those signals are otherwise equal.

That is why dead code may be removed before an earlier catalog entry, and why it is scanned again after a consolidation. The dependency-aware plan is the work queue; the catalog is not.

## Existing repositories

Large repositories can adopt Coherent without fixing everything first:

- Existing debt is allowed after it is baselined.
- New confirmed debt is surfaced separately.
- Resolved debt is tracked positively.
- Uncertain cleanup remains visible until someone confirms, dismisses, or defers it.

Coherent does not create caches or reports by default. Its durable project state is deliberately small:

- Commit `.coherent/ARCHITECTURE.md` after `init` if shared architecture context is useful.
- Commit `.coherent/baseline.json` only when the repository uses `check` for drift prevention.
- Commit `.coherent/decisions.json` when reviews or semantic findings should survive across agents.

`audit`, `inspect`, `plan`, `check`, `doctor`, and `fix next` write no Coherent metadata. Use `coherent inspect --json` for compact audit evidence, the reviewed plan, and the selected next node from one scan. Use `coherent audit --compact-json` when only the non-duplicated finding payload is needed. To retain machine-readable output explicitly, use `coherent audit --output <path>`, combine `--compact-json` with `--output` for the compact shape, or use `coherent plan --output <path>`.

When reviewing several findings, send a JSON array to `coherent review apply`. Coherent resolves the whole batch with one audit and writes `decisions.json` only after every item validates. Individual `confirm`, `dismiss`, and `defer` commands remain convenient for one decision.

Dismissed or deferred Stale compatibility findings must carry a lifecycle.
Use `--expires-at <iso>` when the decision needs a calendar re-review, or
`--removal-milestone <text>` when a release or consumer migration permits
removal. Batch items use `expiresAt` or `removalMilestone`. An expired review
stops applying and the finding becomes reviewable again. If an A07 signal is
not compatibility behavior, use `--not-compatibility` (or
`"notCompatibility": true` in a batch) instead of inventing a lifecycle.

A batch item may use `fingerprints: ["...", "..."]` when one evidence-backed
conclusion applies to a genuine finding group. Raw audit signals remain visible
after dismissal; the reviewed plan is the action queue, and zero plan nodes is
the clean terminal state.

`coherent review prune` previews stale, expired, and orphaned review records. Add
`--write` only after verifying the preview; baseline-backed resolved reviews
are preserved automatically while their lifecycle remains current.

Before committing Coherent state, stage the intended files and run `coherent
doctor --staged --deep`. If the commit changes the CLI dependency, baseline,
or mechanical/hybrid decisions, validate `coherent doctor --ref HEAD --deep`
afterward. The lockfile, detector-version baseline, and those decisions are a
coupled compatibility set; a passing dirty-worktree check is not proof about a
selected commit.

`check` reports gate status separately from drift and annotates NEW findings as
ready, unreviewed, deferred, dismissed, or requiring a full scan. Exit code 0
means the prevention gate passed, not that drift is absent or semantic review
is complete. `inspect` exposes a separate terminal state so deferred-only work
cannot be confused with an empty reviewed plan.

TypeScript analysis reads repository tsconfigs, including inherited compiler options, path aliases, and the owning child config in project-reference workspaces. Resolution stays in memory; Coherent does not generate a synthetic tsconfig or cache.

Optional Cursor and Git integrations remain zero-install unless you pass
`--adapter`, `--alias`, `--rule`, `--cursor-hook`, or `--git-hook`.
`coherent update` refreshes selected skill copies and those integration files;
it does not update the CLI dependency or lockfile. A non-TTY `install` or
`update` without `--yes`, `--providers`, `--scope`, or an integration flag
writes nothing.

## Technical details

### Finding IDs are storage keys, not user vocabulary

Coherent's JSON files and internal catalog retain stable identifiers such as `A08`. They keep baselines, reviews, detector output, and integrations compatible across releases. Users should not have to remember them, choose work by them, or interpret them as execution order. Human-facing guidance and output should lead with finding names.

The source catalog is `src/catalog/rules.ts`; generated reference material lives under `skills/coherent/reference/`.

### Deterministic, semantic, and hybrid findings

- **Deterministic** findings conclude only from mechanical evidence.
- **Semantic** findings require repository context and judgment.
- **Hybrid** findings gather mechanical signals but still require review.

Coherent stays conservative around dependency injection, decorators, reflection, dynamic imports, background jobs, framework registration, public APIs, and package exports. Static absence alone is not enough to delete uncertain code.

### Current packaging

The unscoped `coherent` name on npm belongs to another project, so the public
installer and the CLI dependency use this GitHub repository until Coherent has
a dedicated published package name. The one-command flow is
`npx --yes --package github:sethmgibson/coherent -- coherent install`. After it
exits, the project CLI is installed locally; reload Codex or Cursor and run
`$coherent init` or `/coherent init`.

## Development

Use Node.js 20.19+, 22.13+, or 24+ for the development toolchain.

```bash
pnpm install
pnpm build
pnpm lint
pnpm test
pnpm typecheck
pnpm generate:skill-docs
```

`pnpm validate` runs the full local validation suite. CI also runs `pnpm lint`
with zero allowed warnings. Typed ESLint covers source, tests, scripts, and the
Vitest configuration using `tsconfig.typecheck.json`; generated output and
intentionally problematic test fixtures are excluded. The rules focus on unsafe
`any` operations, unhandled/misused promises, and exhaustive switches, without a
formatting preset. A `void` prefix does not excuse an unhandled promise.

Dependency gates run locally through `pnpm validate` and in CI:

- `pnpm check:dependencies` runs Knip for unused/unlisted dependencies and
  unresolved imports, then repeats against production entrypoints in strict
  mode. CLI and public entrypoints come from `package.json`; scripts and tests
  participate in the development pass. Intentional fixtures are excluded.
- `pnpm check:security` audits runtime and development dependencies and fails
  on high/critical known vulnerabilities or registry errors. It does not run
  automatic fixes or ignore advisories without a resolution.

Dependabot proposes weekly package and GitHub Actions updates. Development
minor/patch updates are grouped; runtime and major updates remain separate.
Updates require review; no auto-merge workflow is installed. Dependency gates
do not replace Coherent's semantic review or its baseline drift checks.

`pnpm check:package` validates the shipped artifact, and runs in CI and
`pnpm validate`. It packs the project (running the existing `prepack` build),
runs publint with warnings treated as errors against that tarball, then installs
it with runtime dependencies only in a temporary directory outside the checkout.
It exercises both CLI names, performs an audit, and compiles and executes a strict
TypeScript consumer of every public export. Consumer imports cannot resolve to
repository sources or development dependencies; only the compiler executable
comes from the checkout. Installation disables lifecycle scripts, requires
registry access for uncached dependencies, and cleans up the temporary files.

When running Coherent against its own checkout before build, invoke
`pnpm exec tsx src/cli.ts <command>`; after build, use
`node dist/cli.js <command>`.

## License

MIT
