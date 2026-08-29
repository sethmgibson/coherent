# Coherent

Maintainability guidance and tooling for backend and large AI-built codebases.

Coherent helps a coding agent understand the architecture that is actually in use, find code and concepts that have drifted, choose a safe cleanup order, and keep new work from adding more debt.

> Quick start: install the skill and CLI from your project root, then run `/coherent init` in your coding tool.

## Install

Requires Node.js 20+ and pnpm.

```bash
npx skills add sethmgibson/coherent
pnpm add --save-dev github:sethmgibson/coherent
```

Restart your coding tool so it discovers the skill. The core skill is provider-neutral; Coherent's optional hook and project-rule installer currently targets Cursor.

## Use it

Start with three commands:

```text
/coherent init
/coherent audit
/coherent fix next
```

- `init` records the repository's living architecture so later work has context.
- `audit` finds maintainability problems without changing code or writing project files.
- `fix next` chooses one safe, unblocked cleanup instead of rewriting the repository wholesale.

For an existing codebase, record today's debt once so future changes can be judged separately:

```text
/coherent baseline
```

After ordinary feature work, check only what changed:

```text
/coherent check --changed
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
| `/coherent init` | Inventory the repository and create durable architecture context |
| `/coherent refresh` | Refresh discovered facts without overwriting confirmed architecture notes |
| `/coherent audit` | Run deterministic checks and guide semantic investigation |
| `/coherent review` | Confirm, dismiss, or defer findings; batch many decisions with `review apply` |
| `/coherent baseline` | Record existing debt so it does not block adoption |
| `/coherent plan` | Build a dependency-aware cleanup plan |
| `/coherent fix next` | Select one safe, unblocked cleanup |
| `/coherent check --changed` | Report new and resolved debt in the current change |
| `/coherent doctor` | Check project-state integrity quickly; add `--deep` to verify reviews against a fresh audit |

Type `/coherent` without a command to get the recommended next step.

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

`audit`, `plan`, `check`, `doctor`, and `fix next` write no Coherent metadata. To retain machine-readable output explicitly, use `coherent audit --output <path>` or `coherent plan --output <path>`.

When reviewing several findings, send a JSON array to `coherent review apply`. Coherent resolves the whole batch with one audit and writes `decisions.json` only after every item validates. Individual `confirm`, `dismiss`, and `defer` commands remain convenient for one decision.

TypeScript analysis reads repository tsconfigs, including inherited compiler options, path aliases, and the owning child config in project-reference workspaces. Resolution stays in memory; Coherent does not generate a synthetic tsconfig or cache.

Optional Cursor and Git integrations are also zero-install by default. Select only what you want, for example `coherent install --rule`, `--cursor-hook`, or `--git-hook`; use `--adapter` only when the coding tool needs a project-local adapter.

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

The skill and CLI currently install separately. The unscoped `coherent` name on npm belongs to another project, so the CLI dependency intentionally uses this GitHub repository until Coherent has a dedicated published package name. A unified installer is the main remaining installation gap compared with [Impeccable](https://github.com/pbakaus/impeccable).

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm generate:skill-docs
```

## License

MIT
