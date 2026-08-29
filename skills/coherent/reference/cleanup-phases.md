<!-- Generated from src/catalog. Do not edit by hand. Run pnpm generate:skill-docs -->

# Cleanup phases

Taxonomy, audit order, cleanup execution, and finding prerequisites are not
the same. The cleanup DAG is authoritative for actual work. These default
phases only break ties when dependencies are otherwise equal.

Dead-code reduction (A08) happens early so later analysis has less surface.
It is re-run after stale-compatibility removal, after canonicalization, and
after architecture collapse because those edits unlock newly unused code.

## Phase 0 — Safety and understanding

`safety-and-understanding`

Inventory the repository, entrypoints, critical workflows, and available behavioral tests. Establish a baseline before changing behavior. This phase is not a rule.

Default sequence: (no rules — inventory, entrypoints, tests, baseline)

## Phase 1 — Mechanical reduction

`mechanical-reduction`

Remove dead code, then stale compatibility, then dead code again. Stay conservative around dependency injection, decorators, reflection, CLI and framework registration, dynamic imports, background jobs, public APIs, and package exports. Do not delete uncertain code merely because static references are absent.

Default sequence: A08 → A07 → A08

## Phase 2 — Establish semantic truth

`semantic-truth`

Build an accurate model of architecture, terminology, and implicit protocols. Do not auto mass-rename or redesign protocols.

Default sequence: A01 → A02 → A03

## Phase 3 — Canonicalize concepts

`canonicalize`

Collapse duplicate implementations, parallel abstractions, and duplicate representations, then re-scan for newly dead code.

Default sequence: A04 → A05 → A06 → A08

## Phase 4 — Collapse accidental architecture

`collapse-architecture`

Remove additive architecture, generic infrastructure, premature abstractions, extra indirection, helper sprawl, and layer violations. Fix surviving boundaries afterward. Re-scan dead code.

Default sequence: B01 → B02 → B03 → B04 → B05 → B06 → A08

## Phase 5 — Repair domain and control-flow design

`repair-domain`

Fix downstream invariant patches, feature overfitting, boolean-state explosion, context-object explosion, and distributed workflow complexity.

Default sequence: C01 → C02 → C03 → C04 → C05

## Phase 6 — Repair failure semantics and tests

`repair-reliability`

Repair defensive programming, swallowed errors, implementation-coupled tests, and mock explosion. Dependency cleanup is a later phase.

Default sequence: D02 → D03 → D04 → D05

## Phase 7 — Dependency cleanup

`dependency-cleanup`

Remove dependency creep only after architecture and call sites have settled, so unused packages are actually unused.

Default sequence: D01

## Phase 8 — Performance

`performance`

Address performance only on architecture that survived earlier phases. Do not optimize code that should be deleted.

Default sequence: E01 → E02 → E03 → E04 → E05 → E06

