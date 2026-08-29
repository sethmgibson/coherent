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
default cleanup-phase model, `init` / `refresh`, a scanner (`audit`,
`baseline`, `check`), a durable decision loop (`decisions.json`), a
finding-specific cleanup DAG (`plan`), a
one-node work brief (`fix next`), and a read-only `doctor`. The coding
agent performs semantic reasoning; there is no hosted LLM service.

## Major applications/services

> Status: automatically discovered (packages and frameworks)

<!-- coherent:discovered -->
Package manager: `pnpm`

Packages:

- `coherent` (`package.json`)

Detected frameworks:

- None detected from package dependencies.

Languages: TypeScript

Approximate size: 141 files, 9374 source lines.

Dependencies: 2 runtime, 4 development.
<!-- /coherent:discovered -->

> Status: confirmed

This is a single CLI package. There are no additional applications or
services. `tests/fixtures/` contains sample repositories for inventory tests
and is ignored via `coherent.json`. Runtime dependencies are `commander`
and `ts-morph`.

## Architectural layers

> Status: confirmed

This is not a layered web service. Modules are named by domain, not by
generic tiers:

- `src/catalog` — rule and phase source of truth
- `src/domain` — Finding
- `src/analysis` — one ts-morph project per scan; helpers current detectors need. The project uses hardcoded compiler options and does not load the target tsconfig, project references, or path aliases.
- `src/detectors` — one function per implemented rule, called explicitly
- `src/audit`, `src/baseline`, `src/check` — CLI workflows and on-disk snapshots
- `src/review` — durable review decisions and semantic-only findings
- `src/plan` — cleanup DAG from merged findings; default phases are tie-breaks only
- `src/fix` — select one unlocked node and write a work brief
- `src/doctor` — read-only integrity checks
- `src/inventory.ts`, `src/inventory-walk.ts`, `src/inventory-scan.ts` — repository inventory
- `src/init` — ARCHITECTURE.md generation and fenced refresh
- `src/install` — Cursor adapter copy, prevention rule, and `check --changed` hooks
- `src/cli.ts` — Commander entry
- `src/config.ts` — optional `coherent.json` and `.coherent` filenames (`BACKEND_DIR` is a deprecated alias for `COHERENT_DIR`)
- `src/state-dir.ts` — resolves `.coherent/` vs leftover `.backend/` during one release
- `skills/coherent/` — provider-neutral skill; taxonomy and phase markdown are generated from the catalog
- `.cursor/skills/coherent` — Cursor adapter only; not a second methodology. `.cursor/skills/backend` is a skill alias.

<!-- coherent:discovered -->
Observed source directories (not inferred layers):

- `src`

Observed top-level modules:

- `src/analysis`
- `src/audit`
- `src/baseline`
- `src/catalog`
- `src/check`
- `src/detectors`
- `src/doctor`
- `src/domain`
- `src/fix`
- `src/init`
- `src/install`
- `src/plan`
- `src/review`
<!-- /coherent:discovered -->

## Domain concepts

> Status: confirmed

- **Rule** — a stable catalog entry (`A01`–`E06`) with detection mode and default phase
- **Cleanup phase** — default execution grouping; not the same as taxonomy order
- **Cleanup DAG / cleanup node** — finding-specific work graph; authoritative for actual cleanup
- **Finding** — one issue instance, with a stable fingerprint
- **Identity** — evidence key used for fingerprints (rule + path + symbol + identity; not line numbers)
- **Review** — durable `confirmed` / `dismissed` / `deferred` decision keyed by fingerprint
- **Inventory** — mechanical facts about a target repository
- **Baseline** — committed fingerprint snapshot of current findings
- **Architecture context** — durable markdown in `.coherent/ARCHITECTURE.md`

## Canonical terminology

> Status: confirmed

- Use **Coherent** for the project and `coherent` for the CLI binary.
- Use **coherent** for the skill namespace (`/coherent init`). `backend` remains a CLI and Cursor skill alias.
- Use **rule** and **rule ID**, not "antipattern" or "lint".
- Use **finding**, not "violation" or "diagnostic".
- Use **detection mode** (`deterministic` | `semantic` | `hybrid`).
- Use **cleanup phase**, not "priority" or "severity", for default grouping.
- Use **cleanup DAG** for actual work order. Phases only break ties.
- Do not introduce a second name for the catalog, inventory, or Finding.

## Data ownership

> Status: confirmed

- Catalog data is owned by `src/catalog/rules.ts` and `src/catalog/phases.ts`.
- Inventory is owned by `collectInventory` and remains in memory.
- Architecture prose is owned by `.coherent/ARCHITECTURE.md`. Machine-owned facts live in `<!-- coherent:discovered -->` fences.
- Audit findings are owned by `runAudit` and remain in memory unless the user explicitly supplies `--output`.
- Reviews and semantic-only findings are stored together in `.coherent/decisions.json` (committed).
- Baseline fingerprints are owned by `runBaseline` and stored in `.coherent/baseline.json` (committed).

## Authoritative representations

> Status: confirmed

- A rule exists only in `src/catalog/rules.ts`. Skill markdown is generated.
- A cleanup phase exists only in `src/catalog/phases.ts`.
- A cleanup node exists only in the plan built from current findings and decisions; JSON is written only through explicit `--output`.
- `RuleCategory` and `CleanupPhase` share `id`/`title`/`summary` by coincidence. They are intentionally different; do not merge. That decision is also recorded in `.coherent/decisions.json`.
- `FindingStatus` (`confirmed` | `candidate`) is the typed status protocol. Review decisions remain distinct from Finding status inside the consolidated decisions file.
- A Finding's identity is its fingerprint of rule ID, `identity`, files, and symbols. Line and column are presentation only.
- Discovered repository facts live in the inventory object; `ARCHITECTURE.md` may quote them but must not become a second inventory.

## Important invariants

> Status: confirmed

- Semantic questions must not be reported as deterministic conclusions.
- `init` must not invent architecture. Unknown sections stay incomplete.
- `init --force` and `refresh` replace only fenced discovered interiors. Semantic prose stays. Unfenced migration (one-release `.backend/` / pre-fence files) keeps unknown human-authored `##` sections verbatim.
- Hybrid and semantic findings are not `fix next` targets until `coherent review confirm`.
- Dismissed findings are absent from the cleanup DAG. Architecture prose alone does not dismiss them. Identity fallback for a review requires a matching `detectorRevision`.
- `check` fails only on new confirmed high/critical deterministic findings. Version-skewed baselines are stale and must be regenerated.
- Taxonomy ID order is not cleanup execution order. The cleanup DAG is authoritative.
- Dead-code (A08) is re-scanned after A07, after canonicalization, and after architecture collapse.
- Analysis does not load the target tsconfig. Path-alias and project-reference resolution are out of scope for the current scanner.

## Provider/external boundaries

> Status: confirmed

No remote services. The canonical agent integration is the provider-neutral
skill in `skills/coherent/`. `.cursor/skills/coherent` is a
thin Cursor adapter. `.cursor/skills/backend` is an alias. `coherent
install` is Cursor-first. There is no multi-provider install pipeline.

## Persistence boundaries

> Status: confirmed

No database. Durable project-local state is limited to `.coherent/ARCHITECTURE.md`, optional `.coherent/baseline.json`, and `.coherent/decisions.json`. Other Coherent commands write no metadata unless the user supplies an explicit output or integration flag.

<!-- coherent:discovered -->
Observed persistence libraries:

- None detected from package dependencies.
<!-- /coherent:discovered -->

## Public APIs

> Status: automatically discovered (package entrypoints and exports)

<!-- coherent:discovered -->
Declared entrypoints and exports:

- `coherent` bin: `coherent` → `./dist/cli.js`
- `coherent` bin: `backend` → `./dist/cli.js`
- `coherent` export: `./dist/catalog/rules.js`
- `coherent` export: `./dist/catalog/phases.js`
- `coherent` export: `./dist/catalog/types.js`
- `coherent` export: `./dist/domain/finding.js`

Probable entrypoint files:

- `src/cli.ts`
<!-- /coherent:discovered -->

> Status: confirmed

User-facing commands are `init`, `refresh`, `audit`, `review`, `baseline`,
`plan`, `fix next`, `check`, `install`, `update`, and `doctor`. Catalog
types are also exported for tests and callers.

## Async/event boundaries

> Status: confirmed

None. The CLI is synchronous process work. No queues, cron, or subscriptions.

## Critical workflows

> Status: confirmed

- `coherent init [root]` keeps inventory in memory and writes architecture context.
- `coherent refresh [root]` updates fenced discovered facts only.
- `coherent audit [root]` parses TypeScript once and runs implemented detectors without writing metadata; `--output` is explicit.
- `coherent review dismiss|confirm|defer <fingerprint>` writes `.coherent/decisions.json`.
- `coherent baseline [root]` snapshots finding fingerprints with portable schema versions.
- `coherent plan [root]` builds a cleanup DAG from a fresh audit merged with reviews and semantic findings.
- `coherent fix next [root]` selects one unlocked `ready` node and prints a work brief.
- `coherent check [root]` compares a fresh audit to the baseline and classifies new debt. `--changed` parses git-diff files plus importers and does not treat unscoped baseline findings as resolved.
- `coherent install [root]` and `update` write nothing without explicit adapter, rule, Cursor hook, or Git hook flags.
- `coherent doctor [root]` reports stale discovery, decision integrity, orphan or stale reviews, baseline integrity when present, and leftover `.backend/` state.
- `pnpm test` covers catalog integrity, inventory fixtures, init, detectors, fingerprints, baseline/check, planner, review merge, and CLI behavior.
- `pnpm generate:skill-docs` must keep `skills/coherent/reference/taxonomy.md` and `cleanup-phases.md` identical to the catalog renderer.

## Transitional/legacy architecture

> Status: confirmed

`.backend/` is a leftover state-directory name. `init` and `doctor` accept it
for one release and tell the user to rename it to `.coherent/`. Do not add
other compatibility shims, plugin hosts, or provider generators "for later."

## Forbidden dependency directions

> Status: confirmed

- The catalog must not import inventory, init, analysis, detectors, or the CLI.
- Findings must not import inventory or CLI.
- Inventory must not import the catalog or Finding.
- Do not add a generic plugin, registry, pipeline, or executor layer. Detectors are ordinary functions called from `runAudit`.
- Plan is ordinary functions over findings. Do not add a workflow engine.

## Testing philosophy

> Status: confirmed

Prefer realistic fixture repositories over mocks. Catalog tests assert data
integrity, not call sequences. CLI tests spawn the real command. Do not add
tests that only prove an internal function was invoked.

<!-- coherent:discovered -->
Observed test directories:

- `tests`
<!-- /coherent:discovered -->

<!-- coherent:architecture-schema 1 -->
