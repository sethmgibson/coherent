# Architecture

This file is durable project context for Coherent. Automatically discovered
facts are labeled. Do not invent architecture for unmarked semantic sections.

## System purpose

> Status: confirmed

Coherent is a developer tool for maintainability of backend and large AI-built
codebases. It exists because repeated agent feature additions create
architectural entropy: extra paths, names, shims, and representations instead
of a changed design.

Success today means a working inventory, a single typed rule catalog, a
default cleanup-phase model, `init`, a scanner (`audit`, `baseline`,
`check`), a finding-specific cleanup DAG (`plan`), and a one-node
work brief (`fix next`). The coding agent performs semantic reasoning;
there is no hosted LLM service.

## Major applications/services

> Status: automatically discovered (packages and frameworks)

Package manager: `pnpm`

Packages:

- `coherent` (`package.json`)

Detected frameworks:

- None detected from package dependencies.

Languages: TypeScript

Approximate size: 35 files, 2185 source lines.

Dependencies: 1 runtime, 4 development.

> Status: confirmed

This is a single CLI package. There are no additional applications or
services. `tests/fixtures/` contains sample repositories for inventory tests
and is ignored via `coherent.json`.

## Architectural layers

> Status: confirmed

This is not a layered web service. Modules are named by domain, not by
generic tiers:

- `src/catalog` — rule and phase source of truth
- `src/domain` — Finding
- `src/analysis` — one ts-morph project per scan; helpers current detectors need
- `src/detectors` — one function per implemented rule, called explicitly
- `src/audit`, `src/baseline`, `src/check` — CLI workflows and on-disk snapshots
- `src/plan` — cleanup DAG from findings; default phases are tie-breaks only
- `src/fix` — select one unlocked node and write a work brief
- `src/inventory.ts`, `src/inventory-walk.ts`, `src/inventory-scan.ts` — repository inventory
- `src/init` — ARCHITECTURE.md generation
- `src/cli.ts` — Commander entry
- `src/config.ts` — optional `coherent.json` and `.backend` filenames
- `skills/backend-maintainability/` — provider-neutral skill; taxonomy and phase markdown are generated from the catalog
- `.cursor/skills/backend` — Cursor adapter only; not a second methodology

Observed source directories (not inferred layers):

- `src`

Observed top-level modules:

- `src/analysis`
- `src/audit`
- `src/baseline`
- `src/catalog`
- `src/check`
- `src/detectors`
- `src/domain`
- `src/init`

## Domain concepts

> Status: confirmed

- **Rule** — a stable catalog entry (`A01`–`E06`) with detection mode and default phase
- **Cleanup phase** — default execution grouping; not the same as taxonomy order
- **Cleanup DAG / cleanup node** — finding-specific work graph; authoritative for actual cleanup
- **Finding** — one issue instance, with a stable fingerprint
- **Identity** — evidence key used for fingerprints (rule + path + symbol + identity; not line numbers)
- **Inventory** — mechanical facts about a target repository
- **Baseline** — committed fingerprint snapshot of current findings
- **Architecture context** — durable markdown in `.backend/ARCHITECTURE.md`

## Canonical terminology

> Status: confirmed

- Use **Coherent** for the project and `coherent` for the CLI binary.
- Use **backend** for the skill namespace (`/backend init`) and the CLI alias.
- Use **rule** and **rule ID**, not "antipattern" or "lint".
- Use **finding**, not "violation" or "diagnostic".
- Use **detection mode** (`deterministic` | `semantic` | `hybrid`).
- Use **cleanup phase**, not "priority" or "severity", for default grouping.
- Use **cleanup DAG** for actual work order. Phases only break ties.
- Do not introduce a second name for the catalog, inventory, or Finding.

## Data ownership

> Status: confirmed

- Catalog data is owned by `src/catalog/rules.ts` and `src/catalog/phases.ts`.
- Inventory is owned by `collectInventory` and may be snapshotted to `.backend/inventory.json`.
- Architecture prose is owned by `.backend/ARCHITECTURE.md`.
- Audit findings are owned by `runAudit` and snapshotted to `.backend/findings.json` (regenerable, gitignored).
- Baseline fingerprints are owned by `runBaseline` and stored in `.backend/baseline.json` (committed).

## Authoritative representations

> Status: confirmed

- A rule exists only in `src/catalog/rules.ts`. Skill markdown is generated.
- A cleanup phase exists only in `src/catalog/phases.ts`.
- A cleanup node exists only in the generated `.backend/plan.json` (regenerable).
- `RuleCategory` and `CleanupPhase` share `id`/`title`/`summary` by coincidence. They are intentionally different; do not merge.
- `FindingStatus` (`confirmed` | `candidate`) is the typed status protocol. Do not invent a parallel string protocol.
- A Finding's identity is its fingerprint of rule ID, `identity`, files, and symbols. Line and column are presentation only.
- Discovered repository facts live in the inventory object; `ARCHITECTURE.md` may quote them but must not become a second inventory.

## Important invariants

> Status: confirmed

- Semantic questions must not be reported as deterministic conclusions.
- `init` must not invent architecture. Unknown sections stay incomplete.
- `init` must not overwrite an existing `ARCHITECTURE.md` without `--force`.
- `check` fails only on new confirmed high/critical deterministic findings.
- Taxonomy ID order is not cleanup execution order. The cleanup DAG is authoritative.
- Dead-code (A08) is re-scanned after A07, after canonicalization, and after architecture collapse.

## Provider/external boundaries

> Status: confirmed

No remote services. The canonical agent integration is the provider-neutral
skill in `skills/backend-maintainability/`. `.cursor/skills/backend` is a
thin Cursor adapter. There is no multi-provider install pipeline.

## Persistence boundaries

> Status: confirmed

No database. Files under `.backend/` are the only project-local state.
`ARCHITECTURE.md` is durable and should be committed. `inventory.json` is a
regenerable snapshot.

Observed persistence libraries:

- None detected from package dependencies.

## Public APIs

> Status: automatically discovered (package entrypoints and exports)

Declared entrypoints and exports:

- `coherent` bin: `coherent` → `./dist/cli.js`
- `coherent` bin: `backend` → `./dist/cli.js`
- `coherent` export: `./dist/catalog/rules.js`
- `coherent` export: `./dist/catalog/phases.js`
- `coherent` export: `./dist/catalog/types.js`
- `coherent` export: `./dist/domain/finding.js`

Probable entrypoint files:

- `src/cli.ts`

> Status: confirmed

User-facing commands are `init`, `audit`, `baseline`, `plan`, `fix next`,
and `check`. Catalog types are also exported for tests and callers.

## Async/event boundaries

> Status: confirmed

None. The CLI is synchronous process work. No queues, cron, or subscriptions.

## Critical workflows

> Status: confirmed

- `coherent init [root]` writes inventory and architecture context.
- `coherent audit [root]` parses TypeScript once, runs implemented detectors, writes `.backend/findings.json`.
- `coherent baseline [root]` snapshots finding fingerprints.
- `coherent plan [root]` builds a cleanup DAG from a fresh audit.
- `coherent fix next [root]` selects one unlocked node and writes a work brief.
- `coherent check [root]` compares a fresh audit to the baseline and classifies new debt.
- `pnpm test` covers catalog integrity, inventory fixtures, init, detectors, fingerprints, baseline/check, planner, and CLI behavior.
- `pnpm generate:skill-docs` must keep `skills/backend-maintainability/reference/taxonomy.md` and `cleanup-phases.md` identical to the catalog renderer.

## Transitional/legacy architecture

> Status: confirmed

Nothing is transitional. Do not add compatibility shims, plugin hosts, or
provider generators "for later."

## Forbidden dependency directions

> Status: confirmed

- The catalog must not import inventory, init, analysis, detectors, or the CLI.
- Findings must not import inventory or CLI.
- Inventory must not import the catalog or Finding.
- Do not add a generic plugin, registry, pipeline, or executor layer. Detectors are ordinary functions called from `runAudit`.
- Plan is ordinary functions over findings. Do not add a workflow engine.

## Testing philosophy

> Status: confirmed

Observed test directories:

- `tests`

Prefer realistic fixture repositories over mocks. Catalog tests assert data
integrity, not call sequences. CLI tests spawn the real command. Do not add
tests that only prove an internal function was invoked.

<!-- coherent:architecture-schema 1 -->
