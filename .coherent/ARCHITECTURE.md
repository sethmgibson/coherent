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
single-scan combined inspection (`inspect`), a one-node work brief
(`fix next`), an executable runtime/skill compatibility handshake (`version`),
and a read-only worktree/index/ref `doctor`. The coding
agent performs semantic reasoning; there is no hosted LLM service.

## Major applications/services

> Status: automatically discovered (packages and frameworks)

<!-- coherent:discovered -->
Package manager: `pnpm`

Packages:

- `coherent` (`package.json`)

Detected frameworks:

- None detected from package dependencies.

Languages: JavaScript, TypeScript

Approximate size: 186 files, 17641 source lines.

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
- `src/analysis` — one in-memory ts-morph project per scan; helpers current detectors need. `createModuleResolver` shares parsed repository tsconfigs, inherited compiler options, path aliases, and owning child configs between full analysis and scoped importer discovery without generating files or caches.
- `src/detectors` — one function per implemented rule, called explicitly
- `src/analysis/nest-reachability.ts` — bounded static Nest module/provider resolution and evidence for exact port calls, HTTP handlers, and lifecycle methods. It uses the current analysis context, respects module visibility, and leaves opaque or ambiguous bindings unresolved; it does not execute Nest or infer bindings from type shapes.
- `src/audit`, `src/baseline`, `src/check` — CLI workflows and on-disk snapshots
- `src/review` — durable review decisions and semantic-only findings
- `src/plan` — cleanup DAG from merged findings; default phases are tie-breaks only
- `src/fix` — select one unlocked node and write a work brief
- `src/inspect.ts` — one read-only audit snapshot feeding the reviewed plan and next-node selection
- `src/doctor` — read-only integrity checks
- `src/runtime.ts` — portable workflow/detector/capability identity plus diagnostic package and lock revision evidence
- `src/inventory.ts`, `src/inventory-walk.ts`, `src/inventory-scan.ts` — repository inventory
- `src/init` — ARCHITECTURE.md generation and fenced refresh
- `src/install` — Codex/Cursor skill-tree adoption, Cursor adapter copy, prevention rule, and `check --changed` hooks. `InstallOptions` is the install/update command flag bag plus test seams, not a request-context object.
- `src/cli.ts` — Commander entry
- `src/config.ts` — optional `coherent.json` and `.coherent` filenames (`BACKEND_DIR` is a deprecated alias for `COHERENT_DIR`)
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
- **Runtime identity** — executable package, workflow, detector, fingerprint, schema, and capability contract used to pair the skill with the CLI
- **Terminal state** — reviewed plan outcome (`ready`, `awaiting_review`, `blocked`, `deferred_only`, or `clean`)

## Canonical terminology

> Status: confirmed

- Use **Coherent** for the project and `coherent` for the CLI binary.
- Use **coherent** for the skill namespace (`$coherent init` in Codex,
  `/coherent init` in Cursor). `backend` remains a CLI and Cursor skill alias.
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
- The release version exists only in `package.json`; `src/version.ts` reads it for artifacts and the CLI.
- Runtime workflow revision and capabilities are owned by `src/runtime.ts`; generated `skills/coherent/reference/runtime.md` keeps the skill requirement synchronized.
- A cleanup node exists only in the plan built from current findings and decisions; JSON is written only through explicit `--output`.
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
- Candidates (including deterministic unused exports), hybrid findings, and semantic findings are not `fix next` targets until `coherent review confirm`. Plan building and review application share the same review predicate. Public/protected methods may be reached through structural ports even in non-exported classes; absent direct references remain candidates.
- Dead-code `test-only` findings preserve test caller locations and stay candidates. Public APIs and intentional test support require review; production-file references are not recursively classified as test-only. Proven static Nest registrations and port bindings count as use before classifying direct references.
- Dismissed findings are absent from the cleanup DAG. Architecture prose alone does not dismiss them. Mechanical and hybrid reviews require a matching `detectorRevision`, including exact fingerprints; exact pure-semantic reviews may survive detector bumps.
- A review whose exact fingerprint remains in the current baseline but is absent from the current audit is resolved history, not an orphan. Deep doctor still rejects reviews absent from both.
- `check` fails only on new confirmed high/critical deterministic findings. Version-skewed baselines are stale and must be regenerated.
- Baseline drift and review disposition are separate. Full `check` may apply identity review matching with the complete peer set; scoped `check --changed` applies exact reviews only and labels possible identity matches `requires_full_scan`.
- A full cleanup must pass the generated runtime compatibility command before scanning or writing reviews. A missing command, workflow/detector mismatch, or missing capability is a hard stop.
- CLI lock, detector-version baseline, and mechanical/hybrid decisions are coupled commit state. Worktree doctor success is not proof about the Git index or a committed ref; use `doctor --staged` and `doctor --ref` for those exact boundaries.
- Taxonomy ID order is not cleanup execution order. The cleanup DAG is authoritative.
- `prerequisiteFindingIds` names current finding fingerprints. The planner maps them through finding groups, ignores same-node references, treats absent fingerprints as satisfied, and preserves explicit `unlocks` text in work briefs.
- Analysis-only prerequisite matching requires a genuinely shared concept, not merely two non-empty concept names. Work briefs preserve all explicit `changeRisk` warnings; high confidence does not imply a low-risk edit.
- Dead-code (A08) is re-scanned after A07, after canonicalization, and after architecture collapse.
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
`inspect`, `plan`, `fix next`, `check`, `install`, `update`, and `doctor`. Catalog
types are also exported for tests and callers.

## Async/event boundaries

> Status: confirmed

None. The CLI is synchronous process work. No queues, cron, or subscriptions.

## Critical workflows

> Status: confirmed

- `coherent init [root]` keeps inventory in memory and writes architecture context.
- `coherent refresh [root]` updates fenced discovered facts only.
- `coherent version [root]` reports portable runtime identity, resolved package/source evidence, and target lock revision; expectation flags fail closed when the active skill and CLI are incompatible.
- `coherent audit [root]` parses TypeScript once and runs implemented detectors without writing metadata; `--output` is explicit and includes portable runtime identity.
- `coherent inspect [root]` uses one audit snapshot for compact findings, the reviewed cleanup DAG, terminal-state classification, and next-node selection without writing metadata.
- `coherent review dismiss|confirm|defer <fingerprint>` writes one decision to `.coherent/decisions.json`; dismissed or deferred live A07 reviews require a future expiry or named removal milestone, expiry reopens the finding, and reviewed false signals are explicitly marked `notCompatibility`. Deferred reviews require `missingEvidence` or `reconsiderWhen`. `review apply` validates a JSON batch against one audit before one locked write, persists supported judgment fields, rejects unknown fields, and accepts `--dry-run` plus a JSON receipt. `review queue` is a read-only item-level view of unreviewed, deferred, and ready findings. `review prune` previews stale, expired, and orphaned records and writes only with `--write`, retaining baseline-backed resolved history only while its lifecycle is current. Review writes use a cross-process lock and atomic replacement. Identity fallback is refused when more than one current finding shares the identity.
- `coherent baseline [root]` snapshots finding fingerprints with portable schema versions and leaves an equivalent existing file byte-for-byte unchanged.
- `coherent plan [root]` builds a cleanup DAG from a fresh audit merged with reviews and semantic findings.
- `coherent fix next [root]` selects one unlocked `ready` node and prints a work brief with reviewed finding fingerprints, exact locations, and evidence from the same scan. JSON exposes selected `findings`; `inspect` exposes them as `nextFindings`, keeping raw audit status separate. An empty reviewed plan is a successful clean terminal; remaining blocked or review-only nodes are not.
- `coherent check [root]` compares a fresh audit to the baseline, classifies new debt, and reports gate status separately from drift and review disposition. `--changed` uses lossless target-relative Git paths (including both rename sides) and TypeScript-resolved transitive importers, respects inventory ignores, does not treat unscoped baseline findings as resolved, and conservatively requires a full scan for identity-only review matches. Full `check` remains necessary for repository-wide conclusions and config-only changes.
- JSON output stays parseable on stdout when combined with explicit `--output`; write acknowledgements go to stderr.
- `coherent install [root]` and `update` write nothing on a non-TTY without `--yes`, `--providers`, `--scope`, or an explicit adapter, rule, Cursor hook, or Git hook flag. TTY `install` can prompt for Codex/Cursor and project vs global. Project adoption installs `github:sethmgibson/coherent` through the detected package manager, verifies the project-local `coherent version` handshake, then copies the packaged skill tree. A failed CLI install or handshake does not copy skills or report success. A different existing `coherent` specifier or malformed `package.json` fails project adoption; a same-repo pin is kept and not rewritten to the unpinned GitHub spec. `--adapter` together with project Cursor adoption writes the skill tree, not a handshake adapter that would block it. `--skills-only` copies skill files without installing the CLI. Global adoption copies skill files only and does not claim the CLI is on `PATH`. `update` refreshes those files only and explicitly does not update the CLI dependency.
- `coherent doctor [root]` checks stale discovery, decision integrity, stale review revisions, baseline/decision revision coupling, compatibility review lifecycles, baseline integrity when present, and leftover `.backend/` state without auditing; `--deep` adds orphan and current-finding review validation through one full audit while retaining baseline-backed resolved reviews whose lifecycle remains current. `--staged` exports the Git index and `--ref` exports a committed tree to a temporary snapshot so the exact artifact is validated without modifying the target repository.
- `pnpm test` covers catalog integrity, inventory fixtures, init, detectors, fingerprints, baseline/check, planner, review merge, and CLI behavior.
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
