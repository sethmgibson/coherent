# Architecture

This file is durable project context for Coherent. Automatically discovered
facts are labeled. Do not invent architecture for unmarked semantic sections.

## System purpose

> Status: confirmed

Coherent is a developer tool for maintainability of backend and large AI-built
codebases. It exists because repeated agent feature additions create
architectural entropy: extra paths, names, shims, and representations instead
of a changed design.

The default is a conversational, class-by-class review: a fresh bare invocation
inspects whole-system simplification, reports proposals before application edits,
and offers fixes or the next class. Requested fixes use targeted evidence, agent
judgment and proportionate validation, then offer to stay or move on. Review
progress lives in the conversation, not a tracking file. The catalog's table
order is the review sequence, not mandatory fix order. Explicit targets override
that sequence. Whole-system simplification is independently selectable and
skippable; it adds no catalog prerequisites to existing classes. No CLI,
baseline, review file, cleanup DAG or initialization is required.
Persistent reviews and baseline/CI checks are explicitly selected optional
workflows. Their stored schemas and review history remain supported. The coding
agent owns sequencing; `plan`, `fix next` and `inspect` return retirement errors.

## Major applications/services

> Status: automatically discovered (packages and frameworks)

<!-- coherent:discovered -->
Package manager: `pnpm`

Packages:

- `coherent` (`package.json`)

Python manifests:

- None discovered.

Detected frameworks:

- None detected from package dependencies.

Languages: JavaScript, TypeScript

Approximate size: 189 files, 18540 source lines.

Dependencies: 2 runtime, 9 development.
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

- `src/catalog` — rule and phase source of truth; `types.ts` is a public barrel derived from those catalogs
- `src/domain` — Finding
- `src/analysis` — one in-memory ts-morph project per scan for TypeScript; helpers current detectors need. `createModuleResolver` shares parsed repository tsconfigs, inherited compiler options, path aliases, and owning child configs between full analysis and scoped importer discovery without generating files or caches. Python uses an explicit stdlib-`ast` sidecar (`python/analyze.py`) spawned by the Node CLI host; there is no plugin registry and no third-party Python runtime dependency.
- `src/detectors` — one function per implemented rule, called explicitly
- `src/analysis/nest-reachability.ts` — bounded static Nest module/provider resolution and evidence for exact port calls, HTTP handlers, and lifecycle methods. It uses the current analysis context, respects module visibility, and leaves opaque or ambiguous bindings unresolved; it does not execute Nest or infer bindings from type shapes.
- `src/audit/collect.ts` — source evidence collection without stored reviews, fingerprints or planning; detectors return minimal Evidence. `audit/run.ts` enriches it into the legacy advanced Finding envelope.
- `src/audit/group.ts` — shared evidence grouping and its JSON shape, consumed by audit output independently of scheduling. Audit text groups findings by catalog category and rule; it does not prescribe cleanup execution order.
- `src/baseline`, `src/check` — optional advanced snapshots and drift checks
- `src/migrate.ts` — explicit context conversion preview/write; preserves baseline and decisions
- `src/review` — durable review decisions and semantic-only findings
- `src/doctor` — read-only integrity checks
- `src/runtime.ts` — portable workflow/detector/capability identity plus diagnostic package and lock revision evidence
- `src/inventory.ts`, `src/inventory-walk.ts`, `src/inventory-scan.ts`, `src/inventory-python.ts` — repository inventory, including `.py` files and pyproject/requirements signals
- `src/init` — ARCHITECTURE.md generation and fenced refresh
- `src/install` — Codex/Cursor skill-tree adoption, Cursor adapter copy, prevention rule, and `check --changed` hooks. `InstallOptions` is the install/update command flag bag plus test seams, not a request-context object.
- `src/cli.ts` — Commander entry
- `src/config.ts` — optional `coherent.json` and `.coherent` filenames
- `src/state-dir.ts` — resolves `.coherent/` vs leftover `.backend/` during one release
- `skills/coherent/` — provider-neutral skill; taxonomy and phase markdown are generated from the catalog. Cursor adapter source uses non-discoverable `skill-template.md`, not a nested `SKILL.md`.
- `.agents/skills/coherent` — Codex discovery adapter; not a second methodology
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
- `src/init`
- `src/install`
- `src/review`
<!-- /coherent:discovered -->

## Domain concepts

> Status: confirmed

- **Rule** — a stable catalog entry (`F01`, plus the existing A–E classes) with
  detection mode and default phase; catalog order starts with F01 and does not
  follow ID sorting
- **Cleanup phase** — legacy catalog data retained for public import compatibility; not an execution schedule
- **Finding** — one issue instance, with a stable fingerprint
- **Identity** — evidence key used for fingerprints (rule + path + symbol + identity; not line numbers)
- **Review** — durable `confirmed` / `dismissed` / `deferred` decision keyed by fingerprint
- **Inventory** — mechanical facts about a target repository
- **Baseline** — committed fingerprint snapshot of current findings
- **Architecture context** — durable markdown in `.coherent/ARCHITECTURE.md`
- **Runtime identity** — executable package, workflow, detector, fingerprint, schema, and capability contract used to pair the skill with the CLI

## Canonical terminology

> Status: confirmed

- Use **Coherent** for the project and `coherent` for the CLI binary.
- Use **coherent** for the skill namespace (`$coherent init` in Codex,
  `/coherent init` in Cursor). `backend` remains a CLI and Cursor skill alias.
- Use **rule** and **rule ID**, not "antipattern" or "lint".
- Use **finding**, not "violation" or "diagnostic".
- Use **detection mode** (`deterministic` | `semantic` | `hybrid`).
- Use **cleanup phase**, not "priority" or "severity", for default grouping.
- The coding agent owns actual work order. Coherent has no cleanup scheduler.
- Do not introduce a second name for the catalog, inventory, or Finding.

## Data ownership

> Status: confirmed

- Catalog data is owned by `src/catalog/rules.ts` and `src/catalog/phases.ts`.
- Inventory is owned by `collectInventory` and remains in memory.
- Default evidence stays in memory; no Coherent metadata is required.
- Architecture prose is owned by `.coherent/ARCHITECTURE.md`. Machine-owned facts live in `<!-- coherent:discovered -->` fences.
- Audit findings are owned by `runAudit` and remain in memory unless the user explicitly supplies `--output`.
- Reviews and semantic-only findings are stored together in `.coherent/decisions.json` (committed).
- Baseline fingerprints are owned by `runBaseline` and stored in `.coherent/baseline.json` (committed).

## Authoritative representations

> Status: confirmed

- A rule exists only in `src/catalog/rules.ts`. Skill markdown is generated.
- A cleanup phase exists only in `src/catalog/phases.ts`.
- The release version exists only in `package.json`; `src/version.ts` reads it for artifacts and the CLI.
- Runtime workflow revision and capabilities are owned by `src/runtime.ts`; generated `skills/coherent/reference/runtime.md` keeps the skill requirement synchronized.
- `RuleCategory` and `CleanupPhase` share `id`/`title`/`summary` by coincidence. They are intentionally different; do not merge. That decision is also recorded in `.coherent/decisions.json`.
- `FindingStatus` (`confirmed` | `candidate`) is the typed status protocol. Review decisions remain distinct from Finding status inside the consolidated decisions file.
- A Finding's identity is its fingerprint of rule ID, `identity`, files, and symbols. Line and column are presentation only.
- Serialized Findings are parsed through `parseFindingInput`; `parseFinding` also requires the stored fingerprint to match the canonical recomputed identity.
- Baseline JSON is parsed only through `parseBaselineFile` / `readBaseline`; baseline, check, review, and doctor consumers share that schema validation.
- Discovered repository facts live in the inventory object; `ARCHITECTURE.md` may quote them but must not become a second inventory.

## Important invariants

> Status: confirmed

- Semantic questions must not be reported as deterministic conclusions.
- `init` must not invent architecture. Unknown sections stay incomplete.
- `init --force` and `refresh` replace only fenced discovered interiors. Semantic prose stays. Unfenced migration (one-release `.backend/` / pre-fence files) keeps unknown human-authored `##` sections verbatim.
- Candidate and semantic findings require evidence-backed interpretation before any requested fix. Review confirmation is a recorded judgment, not a task selection or authorization to implement. Public/protected methods may be reached through structural ports even in non-exported classes; absent direct references remain candidates.
- Dead-code `test-only` findings preserve test caller locations and stay candidates. Public APIs and intentional test support require review; production-file references are not recursively classified as test-only. Proven static Nest registrations and port bindings count as use before classifying direct references.
- Advanced mechanical reviews bind to current source evidence; changed content or missing historical evidence reopens them without rewriting stored state.
- New architecture starters focus on ownership/invariants; legacy refresh remains fenced and focused context is unchanged.
- Review dispositions annotate findings and do not change raw evidence or the CI failure policy. Architecture prose alone does not change a review disposition. Mechanical and hybrid reviews require a matching `detectorRevision`, including exact fingerprints; exact pure-semantic reviews may survive detector bumps.
- A review whose exact fingerprint remains in the current baseline but is absent from the current audit is resolved history, not an orphan. Deep doctor still rejects reviews absent from both.
- `check` fails only on new confirmed high/critical deterministic findings. Version-skewed baselines are stale and must be regenerated.
- Baseline drift and review disposition are separate. Full `check` may apply identity review matching with the complete peer set; scoped `check --changed` applies exact reviews only and labels possible identity matches `requires_full_scan`.
- Explicit persistent review and CI operations must pass the generated runtime compatibility command before using those tools. A missing command, workflow/detector mismatch, or missing capability is a hard stop.
- CLI lock, detector-version baseline, and mechanical/hybrid decisions are coupled commit state. Worktree doctor success is not proof about the Git index or a committed ref; use `doctor --staged` and `doctor --ref` for those exact boundaries.
- Taxonomy order guides conversational review; the coding agent chooses implementation order.
- `prerequisiteFindingIds` and catalog scheduling fields are retained for stored/public compatibility; no execution order is inferred from them.
- Preserve explicit `changeRisk` warnings in evidence and proposals; high confidence does not imply a low-risk edit.
- Dead-code (A08) is re-scanned after A07, after canonicalization, and after architecture collapse. Python dead-code reports only mechanically certain unreachable statements; unused functions, classes, and imports stay unreported because dynamic reachability, decorators, public/module exports, `__all__`, framework registration, reflection, and unknown imports are not deletion evidence.
- Analysis parses repository tsconfigs and uses the owning config for each containing file, so inherited options, path aliases, and child project-reference configs participate in module resolution.

## Provider/external boundaries

> Status: confirmed

No remote services. The canonical agent integration is the provider-neutral
skill in `skills/coherent/`. `.agents/skills/coherent` and
`.cursor/skills/coherent` are thin Codex and Cursor discovery adapters in this
repository. `.cursor/skills/backend` is an alias. `coherent install` adopts
Codex and Cursor only: it copies the packaged skill tree into `.agents` and
`.cursor` (or the matching user-home paths) and, for project scope, installs
the GitHub CLI package through the detected package manager. Explicit
`--adapter`, `--alias`, `--rule`, `--cursor-hook`, `--git-hook`, and
`--skills-only` flags stay opt-in. There is no generic provider plugin pipeline.

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

User-facing commands are `version`, `init`, `refresh`, `audit`, `review`, `baseline`,
`check`, `install`, `update`, and `doctor`. Retired `inspect`, `plan` and
`fix next` only return non-zero errors. Catalog
types are also exported for tests and callers.

## Async/event boundaries

> Status: confirmed

None. The CLI is synchronous process work. No queues, cron, or subscriptions.

## Critical workflows

> Status: confirmed

- `coherent init [root]` keeps inventory in memory and writes architecture context.
- `coherent refresh [root]` updates fenced discovered facts only.
- `coherent version [root]` reports portable runtime identity, resolved package/source evidence, and target lock revision; expectation flags fail closed when the active skill and CLI are incompatible.
- `coherent audit [root]` parses TypeScript once and, when `.py` files are in scope, runs the packaged Python stdlib-`ast` sidecar in one subprocess. It fails closed if those files are in scope and no supported interpreter exists, and it identifies Python syntax errors by file and line. `--output` is explicit and includes portable runtime identity. Inventory skips `__pycache__`, `site-packages`, and local virtualenv directories. The sidecar writes no pycache or other caches.
- `coherent review dismiss|confirm|defer <fingerprint>` writes one decision to `.coherent/decisions.json`; dismissed or deferred live A07 reviews require a future expiry or named removal milestone, expiry reopens the finding, and reviewed false signals are explicitly marked `notCompatibility`. Deferred reviews require `missingEvidence` or `reconsiderWhen`. `review apply` validates a JSON batch against one audit before one locked write, persists supported judgment fields, rejects unknown fields, and accepts `--dry-run` plus a JSON receipt. `review queue` is a read-only item-level view of unreviewed, deferred, and ready findings. `review prune` previews stale, expired, and orphaned records and writes only with `--write`, retaining baseline-backed resolved history only while its lifecycle is current. Review writes use a cross-process lock and atomic replacement. Identity fallback is refused when more than one current finding shares the identity.
- `coherent baseline [root]` snapshots finding fingerprints with portable schema versions and leaves an equivalent existing file byte-for-byte unchanged.
- `coherent check [root]` compares a fresh audit to the baseline, classifies new debt, and reports gate status separately from drift and review disposition. `--changed` uses lossless target-relative Git paths (including both rename sides) plus TypeScript-resolved and Python-ast transitive importers, respects inventory ignores, does not treat unscoped baseline findings as resolved, and conservatively requires a full scan for identity-only review matches. Full `check` remains necessary for repository-wide conclusions and config-only changes.
- JSON output stays parseable on stdout when combined with explicit `--output`; write acknowledgements go to stderr.
- `coherent install [root]` and `update` write nothing on a non-TTY without `--yes`, `--providers`, `--scope`, or an explicit adapter, rule, Cursor hook, or Git hook flag. TTY `install` can prompt for Codex/Cursor and project vs global. Project adoption installs `github:sethmgibson/coherent` through the detected package manager, verifies the project-local `coherent version` handshake, then copies the packaged skill tree. A failed CLI install or handshake does not copy skills or report success. A different existing `coherent` specifier or malformed `package.json` fails project adoption; a same-repo pin is kept and not rewritten to the unpinned GitHub spec. `--adapter` together with project Cursor adoption writes the skill tree, not a handshake adapter that would block it. `--skills-only` copies skill files without installing the CLI. Global adoption copies skill files only and does not claim the CLI is on `PATH`. `update` refreshes those files only and explicitly does not update the CLI dependency.
- `coherent doctor [root]` checks stale discovery, decision integrity, stale review revisions, baseline/decision revision coupling, compatibility review lifecycles, baseline integrity when present, and leftover `.backend/` state without auditing; `--deep` adds orphan and current-finding review validation through one full audit while retaining baseline-backed resolved reviews whose lifecycle remains current. `--staged` exports the Git index and `--ref` exports a committed tree to a temporary snapshot so the exact artifact is validated without modifying the target repository.
- `pnpm test` covers catalog integrity, inventory fixtures, init, detectors, fingerprints, baseline/check, review matching, and CLI behavior.
- `pnpm validate` runs zero-warning type-aware ESLint, dependency hygiene/security checks, tests, typecheck, packed-package validation (including the prepack build), generated skill-doc consistency, and committed fingerprint uniqueness. CI runs the same gates plus Coherent check and deep doctor. `pnpm check:package` applies strict publint to the tarball and tests installed CLI aliases and public exports in an isolated runtime-only consumer. ESLint uses `tsconfig.typecheck.json` for source, tests, scripts, and the Vitest configuration while excluding generated output and intentionally problematic fixtures. `pnpm generate:skill-docs` owns the generated catalog and runtime references.

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
- Do not add a generic plugin, registry, pipeline, or executor layer. Detectors are ordinary functions called from `collectEvidence`; `runAudit` enriches their evidence into the legacy advanced Finding envelope. Python analysis is an explicit sidecar call, not a language-plugin host.
- Do not reintroduce cleanup scheduling, priority scoring, or a workflow engine.

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
