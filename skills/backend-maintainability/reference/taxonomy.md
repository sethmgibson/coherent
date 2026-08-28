<!-- Generated from src/catalog. Do not edit by hand. Run pnpm generate:skill-docs -->

# Taxonomy

Rule IDs are stable identifiers. Rule ID order is **not** cleanup execution
order. See [cleanup-phases.md](cleanup-phases.md).

Source of truth: `src/catalog/rules.ts`.

| ID | Slug | Title | Detection | Phase | Work |
|---|---|---|---|---|---|
| A01 | architecture-fossilization | Architecture fossilization | semantic | 2 | analysis |
| A02 | terminology-drift | Terminology drift | semantic | 2 | analysis |
| A03 | implicit-string-protocols | Implicit string protocols | hybrid | 2 | analysis |
| A04 | duplicate-implementations | Duplicate implementations | hybrid | 3 | both |
| A05 | parallel-abstractions | Parallel abstractions | hybrid | 3 | both |
| A06 | duplicate-representations | Duplicate representations | hybrid | 3 | both |
| A07 | stale-compatibility | Stale compatibility | hybrid | 1 | mutation |
| A08 | dead-code | Dead code | deterministic | 1 | mutation |
| B01 | additive-architecture | Additive architecture | semantic | 4 | both |
| B02 | generic-infrastructure | Generic infrastructure | semantic | 4 | both |
| B03 | premature-abstraction | Premature abstraction | hybrid | 4 | both |
| B04 | excessive-indirection | Excessive indirection | hybrid | 4 | both |
| B05 | helper-proliferation | Helper proliferation | hybrid | 4 | both |
| B06 | layer-violations | Layer violations | hybrid | 4 | both |
| C01 | downstream-invariant-patches | Downstream invariant patches | semantic | 5 | both |
| C02 | feature-overfitting | Feature overfitting | semantic | 5 | both |
| C03 | boolean-state-explosion | Boolean state explosion | hybrid | 5 | both |
| C04 | context-object-explosion | Context object explosion | hybrid | 5 | both |
| C05 | distributed-workflow-complexity | Distributed workflow complexity | semantic | 5 | both |
| D01 | dependency-creep | Dependency creep | hybrid | 7 | mutation |
| D02 | defensive-programming | Defensive programming | hybrid | 6 | both |
| D03 | swallowed-errors | Swallowed errors | hybrid | 6 | both |
| D04 | implementation-coupled-tests | Implementation-coupled tests | hybrid | 6 | both |
| D05 | mock-explosion | Mock explosion | hybrid | 6 | both |
| E01 | redundant-db-access | Redundant database access | hybrid | 8 | both |
| E02 | repeated-computation | Repeated computation | hybrid | 8 | both |
| E03 | over-fetching | Over-fetching | hybrid | 8 | both |
| E04 | serialization-overhead | Serialization overhead | hybrid | 8 | both |
| E05 | unnecessary-sequential-io | Unnecessary sequential I/O | hybrid | 8 | both |
| E06 | algorithmic-complexity | Algorithmic complexity | hybrid | 8 | both |

Detection modes:

- **deterministic** — conclude only from mechanical evidence. Never upgrade a semantic question into a fake deterministic result.
- **semantic** — requires human or agent judgment about meaning, ownership, or intent.
- **hybrid** — mechanical signals exist, but the conclusion still needs judgment.

## A. Leftover structure and representations

Fossilized architecture, drifted names, implicit protocols, duplicated concepts, stale compatibility, and dead code.

### A01 Architecture fossilization

- Slug: `architecture-fossilization`
- Detection: semantic
- Default phase: 2
- Work: analysis
- Prerequisites: none
- Re-scan after: none

Layers, modules, or boundaries that once served a design no longer match how the system actually works.

Why it matters: Agents and humans keep extending a fossil instead of the living design, which accelerates entropy.

### A02 Terminology drift

- Slug: `terminology-drift`
- Detection: semantic
- Default phase: 2
- Work: analysis
- Prerequisites: none
- Re-scan after: none

The same domain concept is named differently across modules, APIs, tables, or docs, or one name means different things.

Why it matters: Drift forces every change to translate, and later work invents yet another name rather than using the canonical one.

### A03 Implicit string protocols

- Slug: `implicit-string-protocols`
- Detection: hybrid
- Default phase: 2
- Work: analysis
- Prerequisites: none
- Re-scan after: none

Behavioral contracts are encoded as loosely shared strings, magic prefixes, or ad-hoc formats instead of explicit types or schemas.

Why it matters: Callers and producers can diverge silently; refactors cannot find every participant in the protocol.

### A04 Duplicate implementations

- Slug: `duplicate-implementations`
- Detection: hybrid
- Default phase: 3
- Work: both
- Prerequisites: A01, A02
- Re-scan after: A08, B04, B05, D04, D05

The same behavior exists in more than one place, usually after repeated feature additions that did not find the existing path.

Why it matters: Fixes and invariants have to be applied N times, and the copies drift until no one knows which is authoritative.

### A05 Parallel abstractions

- Slug: `parallel-abstractions`
- Detection: hybrid
- Default phase: 3
- Work: both
- Prerequisites: A01, A02
- Re-scan after: A08, B04, B05

Two or more overlapping models exist for the same job: services vs use-cases, repositories vs stores, clients vs gateways.

Why it matters: New work has no obvious home, so agents add a third abstraction instead of extending one.

### A06 Duplicate representations

- Slug: `duplicate-representations`
- Detection: hybrid
- Default phase: 3
- Work: both
- Prerequisites: A01, A02
- Re-scan after: A08, B05, E04

The same information is modeled more than once — types, DTOs, documents, or tables — without a declared authority.

Why it matters: Each representation can be updated independently, which produces contradiction and mapping glue.

### A07 Stale compatibility

- Slug: `stale-compatibility`
- Detection: hybrid
- Default phase: 1
- Work: mutation
- Prerequisites: none
- Re-scan after: A08

Shims, dual code paths, deprecated flags, or compatibility adapters remain after the old contract has no remaining callers.

Why it matters: Compatibility layers become a second system that new features must honor, even when nobody needs them.

### A08 Dead code

- Slug: `dead-code`
- Detection: deterministic
- Default phase: 1
- Work: mutation
- Prerequisites: none
- Re-scan after: none

Files, exports, or branches that are not reachable from entrypoints, registrations, or public APIs, after conservative dynamic-use checks.

Why it matters: Dead code is scanned, tested, and imitated. Removing it early shrinks every later pass; removing it again after consolidation catches leftovers.

## B. Accidental architecture

Structure added instead of changed: generic infrastructure, premature abstractions, extra layers, and helper sprawl.

### B01 Additive architecture

- Slug: `additive-architecture`
- Detection: semantic
- Default phase: 4
- Work: both
- Prerequisites: A04, A05, A06
- Re-scan after: A08, D01, E01, E02, E03, E04, E05, E06

A new layer, module, or pathway was added beside existing ones instead of changing the design that should have absorbed the work.

Why it matters: Repeated agent feature additions default to adding. The result is a thicker system that does the same jobs in more places.

### B02 Generic infrastructure

- Slug: `generic-infrastructure`
- Detection: semantic
- Default phase: 4
- Work: both
- Prerequisites: A04, A05, A06
- Re-scan after: A08, D01, E01, E02, E03, E04, E05, E06

A framework, pipeline, registry, or platform exists for a family of cases that has only one or two real members.

Why it matters: Generic infrastructure is expensive to understand and becomes the place the next one-off is forced to live.

### B03 Premature abstraction

- Slug: `premature-abstraction`
- Detection: hybrid
- Default phase: 4
- Work: both
- Prerequisites: A04, A05, A06
- Re-scan after: A08, D01, E01, E02, E03, E04, E05, E06

Interfaces, factories, or shared helpers were introduced before a second real implementation or call site existed.

Why it matters: The abstraction freezes an incomplete understanding and makes the obvious code harder to change than the rare variant.

### B04 Excessive indirection

- Slug: `excessive-indirection`
- Detection: hybrid
- Default phase: 4
- Work: both
- Prerequisites: A04, A05, A06
- Re-scan after: A08, D01, E01, E02, E03, E04, E05, E06

Behavior is reached only through forwarding wrappers, pass-through services, or hops that add no policy or boundary.

Why it matters: Indirection hides the authoritative implementation and multiplies files that must change together.

### B05 Helper proliferation

- Slug: `helper-proliferation`
- Detection: hybrid
- Default phase: 4
- Work: both
- Prerequisites: A04, A05, A06
- Re-scan after: A08, D01, E01, E02, E03, E04, E05, E06

Small utilities accumulate until domain behavior is scattered across helpers that no longer share a clear owner.

Why it matters: Helpers are easy to add and hard to retire; they become a junk drawer that later agents keep extending.

### B06 Layer violations

- Slug: `layer-violations`
- Detection: hybrid
- Default phase: 4
- Work: both
- Prerequisites: A01, A04, A05
- Re-scan after: A08

A module depends in a direction the architecture forbids, or a declared layer is routinely bypassed.

Why it matters: Once a forbidden edge exists, the next change copies it, and the layering document becomes fiction.

## C. Domain and control-flow design

Invariants patched downstream, features overfitting one path, and exploding flags, context objects, or workflows.

### C01 Downstream invariant patches

- Slug: `downstream-invariant-patches`
- Detection: semantic
- Default phase: 5
- Work: both
- Prerequisites: A01, B01
- Re-scan after: none

A rule that belongs at the source of a concept is enforced with special cases, guards, or mappings further downstream.

Why it matters: Every new consumer must rediscover the invariant, so patches multiply and still miss a path.

### C02 Feature overfitting

- Slug: `feature-overfitting`
- Detection: semantic
- Default phase: 5
- Work: both
- Prerequisites: A01, B01
- Re-scan after: none

A general workflow or type has been bent around one feature's shape, making neighboring cases awkward or impossible.

Why it matters: The next feature either forks the workflow or adds another flag, which is how control flow explodes.

### C03 Boolean state explosion

- Slug: `boolean-state-explosion`
- Detection: hybrid
- Default phase: 5
- Work: both
- Prerequisites: C02
- Re-scan after: none

Behavior is selected by a growing set of booleans or status flags whose combinations are not a coherent state model.

Why it matters: Impossible combinations leak into production, and each new flag doubles the mental state space.

### C04 Context object explosion

- Slug: `context-object-explosion`
- Detection: hybrid
- Default phase: 5
- Work: both
- Prerequisites: B04
- Re-scan after: none

A catch-all context, options, or bag of optional fields is threaded through the stack because no one owns the real inputs.

Why it matters: Callers cannot tell what is required, and every new field becomes ambient global state.

### C05 Distributed workflow complexity

- Slug: `distributed-workflow-complexity`
- Detection: semantic
- Default phase: 5
- Work: both
- Prerequisites: B01, C01
- Re-scan after: none

A single business workflow is split across handlers, queues, and retries without an explicit orchestration or ownership model.

Why it matters: Failure, replay, and visibility become accidental. Agents add more hops because the existing path is hard to see.

## D. Failure semantics, tests, and dependencies

Defensive noise, swallowed errors, tests coupled to internals, mock pyramids, and unnecessary packages.

### D01 Dependency creep

- Slug: `dependency-creep`
- Detection: hybrid
- Default phase: 7
- Work: mutation
- Prerequisites: B02
- Re-scan after: none

Packages remain after their last real use, or a heavy dependency was added for a job the language or an existing library already does.

Why it matters: Unused and overlapping dependencies increase install cost, attack surface, and the set of APIs agents will imitate.

### D02 Defensive programming

- Slug: `defensive-programming`
- Detection: hybrid
- Default phase: 6
- Work: both
- Prerequisites: C01
- Re-scan after: none

Null checks, retries, and fallbacks are sprinkled at every layer instead of enforcing a contract at the boundary that owns it.

Why it matters: Defense that does not own the invariant hides bugs and makes the real failure mode impossible to see.

### D03 Swallowed errors

- Slug: `swallowed-errors`
- Detection: hybrid
- Default phase: 6
- Work: both
- Prerequisites: none
- Re-scan after: none

Failures are caught and ignored, mapped to empty values, or logged without changing control flow that callers can observe.

Why it matters: The system continues in an undefined state, and later cleanup cannot tell broken paths from intentional ones.

### D04 Implementation-coupled tests

- Slug: `implementation-coupled-tests`
- Detection: hybrid
- Default phase: 6
- Work: both
- Prerequisites: none
- Re-scan after: none

Tests assert internals, call graphs, or mock interactions instead of the behavior a caller can observe.

Why it matters: Coupled tests lock accidental structure in place and fail when cleanup improves the design.

### D05 Mock explosion

- Slug: `mock-explosion`
- Detection: hybrid
- Default phase: 6
- Work: both
- Prerequisites: D04
- Re-scan after: none

Tests construct large mock graphs to reach a unit, usually because the unit is not separable or the test is not behavioral.

Why it matters: Mocks encode the current wiring. Cleanup that deletes a hop looks like a mass test rewrite, so the hop survives.

## E. Performance

Redundant I/O, repeated work, over-fetching, serialization cost, and accidental complexity — only after the design survives.

### E01 Redundant database access

- Slug: `redundant-db-access`
- Detection: hybrid
- Default phase: 8
- Work: both
- Prerequisites: none
- Re-scan after: none

The same data is loaded repeatedly in one request or workflow, or N+1 queries remain after the shape of the work is known.

Why it matters: On surviving architecture this is usually the cheapest performance win and the one agents reintroduce by composing services naively.

### E02 Repeated computation

- Slug: `repeated-computation`
- Detection: hybrid
- Default phase: 8
- Work: both
- Prerequisites: none
- Re-scan after: none

Pure or expensive work is recomputed in a loop or across layers when a local result would be correct.

Why it matters: Repeated work is often a symptom of missing ownership; fix ownership first, then the leftover hot path.

### E03 Over-fetching

- Slug: `over-fetching`
- Detection: hybrid
- Default phase: 8
- Work: both
- Prerequisites: A06
- Re-scan after: none

Queries, API calls, or aggregates load wide payloads when a narrow projection is what the caller uses.

Why it matters: Over-fetching couples consumers to unused fields and makes later representation cleanup harder.

### E04 Serialization overhead

- Slug: `serialization-overhead`
- Detection: hybrid
- Default phase: 8
- Work: both
- Prerequisites: A06
- Re-scan after: none

Data is encoded, copied, or mapped through several representations in a single path without a boundary that requires it.

Why it matters: Each extra mapping is another place for A06 to hide and a cost that disappears if representations are canonicalized first.

### E05 Unnecessary sequential I/O

- Slug: `unnecessary-sequential-io`
- Detection: hybrid
- Default phase: 8
- Work: both
- Prerequisites: none
- Re-scan after: none

Independent I/O waits in sequence — serial awaits, sequential HTTP, or staged disk reads that have no data dependency.

Why it matters: Sequential I/O is easy for agents to write and expensive at runtime once the design is otherwise sound.

### E06 Algorithmic complexity

- Slug: `algorithmic-complexity`
- Detection: hybrid
- Default phase: 8
- Work: both
- Prerequisites: none
- Re-scan after: none

A hot path uses a more expensive algorithm or data structure than the actual size and access pattern require.

Why it matters: This is last because the right algorithm on the wrong architecture is wasted work, and because it is easy to overfit a micro-benchmark.

