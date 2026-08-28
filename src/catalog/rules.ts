import type { Rule, RuleCategory, RuleId } from "./types.js";

export const CATEGORIES: readonly RuleCategory[] = [
  {
    id: "A",
    title: "Leftover structure and representations",
    summary:
      "Fossilized architecture, drifted names, implicit protocols, duplicated concepts, stale compatibility, and dead code.",
  },
  {
    id: "B",
    title: "Accidental architecture",
    summary:
      "Structure added instead of changed: generic infrastructure, premature abstractions, extra layers, and helper sprawl.",
  },
  {
    id: "C",
    title: "Domain and control-flow design",
    summary:
      "Invariants patched downstream, features overfitting one path, and exploding flags, context objects, or workflows.",
  },
  {
    id: "D",
    title: "Failure semantics, tests, and dependencies",
    summary:
      "Defensive noise, swallowed errors, tests coupled to internals, mock pyramids, and unnecessary packages.",
  },
  {
    id: "E",
    title: "Performance",
    summary:
      "Redundant I/O, repeated work, over-fetching, serialization cost, and accidental complexity — only after the design survives.",
  },
];

export const RULES: readonly Rule[] = [
  {
    id: "A01",
    slug: "architecture-fossilization",
    title: "Architecture fossilization",
    category: "A",
    detectionMode: "semantic",
    description:
      "Layers, modules, or boundaries that once served a design no longer match how the system actually works.",
    whyItMatters:
      "Agents and humans keep extending a fossil instead of the living design, which accelerates entropy.",
    defaultCleanupPhase: 2,
    workKind: "analysis",
    prerequisites: [],
    rescanAfter: [],
  },
  {
    id: "A02",
    slug: "terminology-drift",
    title: "Terminology drift",
    category: "A",
    detectionMode: "semantic",
    description:
      "The same domain concept is named differently across modules, APIs, tables, or docs, or one name means different things.",
    whyItMatters:
      "Drift forces every change to translate, and later work invents yet another name rather than using the canonical one.",
    defaultCleanupPhase: 2,
    workKind: "analysis",
    prerequisites: [],
    rescanAfter: [],
  },
  {
    id: "A03",
    slug: "implicit-string-protocols",
    title: "Implicit string protocols",
    category: "A",
    detectionMode: "hybrid",
    description:
      "Behavioral contracts are encoded as loosely shared strings, magic prefixes, or ad-hoc formats instead of explicit types or schemas.",
    whyItMatters:
      "Callers and producers can diverge silently; refactors cannot find every participant in the protocol.",
    defaultCleanupPhase: 2,
    workKind: "analysis",
    prerequisites: [],
    rescanAfter: [],
  },
  {
    id: "A04",
    slug: "duplicate-implementations",
    title: "Duplicate implementations",
    category: "A",
    detectionMode: "hybrid",
    description:
      "The same behavior exists in more than one place, usually after repeated feature additions that did not find the existing path.",
    whyItMatters:
      "Fixes and invariants have to be applied N times, and the copies drift until no one knows which is authoritative.",
    defaultCleanupPhase: 3,
    workKind: "both",
    prerequisites: ["A01", "A02"],
    rescanAfter: ["A08", "B04", "B05", "D04", "D05"],
  },
  {
    id: "A05",
    slug: "parallel-abstractions",
    title: "Parallel abstractions",
    category: "A",
    detectionMode: "hybrid",
    description:
      "Two or more overlapping models exist for the same job: services vs use-cases, repositories vs stores, clients vs gateways.",
    whyItMatters:
      "New work has no obvious home, so agents add a third abstraction instead of extending one.",
    defaultCleanupPhase: 3,
    workKind: "both",
    prerequisites: ["A01", "A02"],
    rescanAfter: ["A08", "B04", "B05"],
  },
  {
    id: "A06",
    slug: "duplicate-representations",
    title: "Duplicate representations",
    category: "A",
    detectionMode: "hybrid",
    description:
      "The same information is modeled more than once — types, DTOs, documents, or tables — without a declared authority.",
    whyItMatters:
      "Each representation can be updated independently, which produces contradiction and mapping glue.",
    defaultCleanupPhase: 3,
    workKind: "both",
    prerequisites: ["A01", "A02"],
    rescanAfter: ["A08", "B05", "E04"],
  },
  {
    id: "A07",
    slug: "stale-compatibility",
    title: "Stale compatibility",
    category: "A",
    detectionMode: "hybrid",
    description:
      "Shims, dual code paths, deprecated flags, or compatibility adapters remain after the old contract has no remaining callers.",
    whyItMatters:
      "Compatibility layers become a second system that new features must honor, even when nobody needs them.",
    defaultCleanupPhase: 1,
    workKind: "mutation",
    prerequisites: [],
    rescanAfter: ["A08"],
  },
  {
    id: "A08",
    slug: "dead-code",
    title: "Dead code",
    category: "A",
    detectionMode: "deterministic",
    description:
      "Files, exports, or branches that are not reachable from entrypoints, registrations, or public APIs, after conservative dynamic-use checks.",
    whyItMatters:
      "Dead code is scanned, tested, and imitated. Removing it early shrinks every later pass; removing it again after consolidation catches leftovers.",
    defaultCleanupPhase: 1,
    workKind: "mutation",
    prerequisites: [],
    rescanAfter: [],
  },
  {
    id: "B01",
    slug: "additive-architecture",
    title: "Additive architecture",
    category: "B",
    detectionMode: "semantic",
    description:
      "A new layer, module, or pathway was added beside existing ones instead of changing the design that should have absorbed the work.",
    whyItMatters:
      "Repeated agent feature additions default to adding. The result is a thicker system that does the same jobs in more places.",
    defaultCleanupPhase: 4,
    workKind: "both",
    prerequisites: ["A04", "A05", "A06"],
    rescanAfter: ["A08", "D01", "E01", "E02", "E03", "E04", "E05", "E06"],
  },
  {
    id: "B02",
    slug: "generic-infrastructure",
    title: "Generic infrastructure",
    category: "B",
    detectionMode: "semantic",
    description:
      "A framework, pipeline, registry, or platform exists for a family of cases that has only one or two real members.",
    whyItMatters:
      "Generic infrastructure is expensive to understand and becomes the place the next one-off is forced to live.",
    defaultCleanupPhase: 4,
    workKind: "both",
    prerequisites: ["A04", "A05", "A06"],
    rescanAfter: ["A08", "D01", "E01", "E02", "E03", "E04", "E05", "E06"],
  },
  {
    id: "B03",
    slug: "premature-abstraction",
    title: "Premature abstraction",
    category: "B",
    detectionMode: "hybrid",
    description:
      "Interfaces, factories, or shared helpers were introduced before a second real implementation or call site existed.",
    whyItMatters:
      "The abstraction freezes an incomplete understanding and makes the obvious code harder to change than the rare variant.",
    defaultCleanupPhase: 4,
    workKind: "both",
    prerequisites: ["A04", "A05", "A06"],
    rescanAfter: ["A08", "D01", "E01", "E02", "E03", "E04", "E05", "E06"],
  },
  {
    id: "B04",
    slug: "excessive-indirection",
    title: "Excessive indirection",
    category: "B",
    detectionMode: "hybrid",
    description:
      "Behavior is reached only through forwarding wrappers, pass-through services, or hops that add no policy or boundary.",
    whyItMatters:
      "Indirection hides the authoritative implementation and multiplies files that must change together.",
    defaultCleanupPhase: 4,
    workKind: "both",
    prerequisites: ["A04", "A05", "A06"],
    rescanAfter: ["A08", "D01", "E01", "E02", "E03", "E04", "E05", "E06"],
  },
  {
    id: "B05",
    slug: "helper-proliferation",
    title: "Helper proliferation",
    category: "B",
    detectionMode: "hybrid",
    description:
      "Small utilities accumulate until domain behavior is scattered across helpers that no longer share a clear owner.",
    whyItMatters:
      "Helpers are easy to add and hard to retire; they become a junk drawer that later agents keep extending.",
    defaultCleanupPhase: 4,
    workKind: "both",
    prerequisites: ["A04", "A05", "A06"],
    rescanAfter: ["A08", "D01", "E01", "E02", "E03", "E04", "E05", "E06"],
  },
  {
    id: "B06",
    slug: "layer-violations",
    title: "Layer violations",
    category: "B",
    detectionMode: "hybrid",
    description:
      "A module depends in a direction the architecture forbids, or a declared layer is routinely bypassed.",
    whyItMatters:
      "Once a forbidden edge exists, the next change copies it, and the layering document becomes fiction.",
    defaultCleanupPhase: 4,
    workKind: "both",
    prerequisites: ["A01", "A04", "A05"],
    rescanAfter: ["A08"],
  },
  {
    id: "C01",
    slug: "downstream-invariant-patches",
    title: "Downstream invariant patches",
    category: "C",
    detectionMode: "semantic",
    description:
      "A rule that belongs at the source of a concept is enforced with special cases, guards, or mappings further downstream.",
    whyItMatters:
      "Every new consumer must rediscover the invariant, so patches multiply and still miss a path.",
    defaultCleanupPhase: 5,
    workKind: "both",
    prerequisites: ["A01", "B01"],
    rescanAfter: [],
  },
  {
    id: "C02",
    slug: "feature-overfitting",
    title: "Feature overfitting",
    category: "C",
    detectionMode: "semantic",
    description:
      "A general workflow or type has been bent around one feature's shape, making neighboring cases awkward or impossible.",
    whyItMatters:
      "The next feature either forks the workflow or adds another flag, which is how control flow explodes.",
    defaultCleanupPhase: 5,
    workKind: "both",
    prerequisites: ["A01", "B01"],
    rescanAfter: [],
  },
  {
    id: "C03",
    slug: "boolean-state-explosion",
    title: "Boolean state explosion",
    category: "C",
    detectionMode: "hybrid",
    description:
      "Behavior is selected by a growing set of booleans or status flags whose combinations are not a coherent state model.",
    whyItMatters:
      "Impossible combinations leak into production, and each new flag doubles the mental state space.",
    defaultCleanupPhase: 5,
    workKind: "both",
    prerequisites: ["C02"],
    rescanAfter: [],
  },
  {
    id: "C04",
    slug: "context-object-explosion",
    title: "Context object explosion",
    category: "C",
    detectionMode: "hybrid",
    description:
      "A catch-all context, options, or bag of optional fields is threaded through the stack because no one owns the real inputs.",
    whyItMatters:
      "Callers cannot tell what is required, and every new field becomes ambient global state.",
    defaultCleanupPhase: 5,
    workKind: "both",
    prerequisites: ["B04"],
    rescanAfter: [],
  },
  {
    id: "C05",
    slug: "distributed-workflow-complexity",
    title: "Distributed workflow complexity",
    category: "C",
    detectionMode: "semantic",
    description:
      "A single business workflow is split across handlers, queues, and retries without an explicit orchestration or ownership model.",
    whyItMatters:
      "Failure, replay, and visibility become accidental. Agents add more hops because the existing path is hard to see.",
    defaultCleanupPhase: 5,
    workKind: "both",
    prerequisites: ["B01", "C01"],
    rescanAfter: [],
  },
  {
    id: "D01",
    slug: "dependency-creep",
    title: "Dependency creep",
    category: "D",
    detectionMode: "hybrid",
    description:
      "Packages remain after their last real use, or a heavy dependency was added for a job the language or an existing library already does.",
    whyItMatters:
      "Unused and overlapping dependencies increase install cost, attack surface, and the set of APIs agents will imitate.",
    defaultCleanupPhase: 7,
    workKind: "mutation",
    prerequisites: ["B02"],
    rescanAfter: [],
  },
  {
    id: "D02",
    slug: "defensive-programming",
    title: "Defensive programming",
    category: "D",
    detectionMode: "hybrid",
    description:
      "Null checks, retries, and fallbacks are sprinkled at every layer instead of enforcing a contract at the boundary that owns it.",
    whyItMatters:
      "Defense that does not own the invariant hides bugs and makes the real failure mode impossible to see.",
    defaultCleanupPhase: 6,
    workKind: "both",
    prerequisites: ["C01"],
    rescanAfter: [],
  },
  {
    id: "D03",
    slug: "swallowed-errors",
    title: "Swallowed errors",
    category: "D",
    detectionMode: "hybrid",
    description:
      "Failures are caught and ignored, mapped to empty values, or logged without changing control flow that callers can observe.",
    whyItMatters:
      "The system continues in an undefined state, and later cleanup cannot tell broken paths from intentional ones.",
    defaultCleanupPhase: 6,
    workKind: "both",
    prerequisites: [],
    rescanAfter: [],
  },
  {
    id: "D04",
    slug: "implementation-coupled-tests",
    title: "Implementation-coupled tests",
    category: "D",
    detectionMode: "hybrid",
    description:
      "Tests assert internals, call graphs, or mock interactions instead of the behavior a caller can observe.",
    whyItMatters:
      "Coupled tests lock accidental structure in place and fail when cleanup improves the design.",
    defaultCleanupPhase: 6,
    workKind: "both",
    prerequisites: [],
    rescanAfter: [],
  },
  {
    id: "D05",
    slug: "mock-explosion",
    title: "Mock explosion",
    category: "D",
    detectionMode: "hybrid",
    description:
      "Tests construct large mock graphs to reach a unit, usually because the unit is not separable or the test is not behavioral.",
    whyItMatters:
      "Mocks encode the current wiring. Cleanup that deletes a hop looks like a mass test rewrite, so the hop survives.",
    defaultCleanupPhase: 6,
    workKind: "both",
    prerequisites: ["D04"],
    rescanAfter: [],
  },
  {
    id: "E01",
    slug: "redundant-db-access",
    title: "Redundant database access",
    category: "E",
    detectionMode: "hybrid",
    description:
      "The same data is loaded repeatedly in one request or workflow, or N+1 queries remain after the shape of the work is known.",
    whyItMatters:
      "On surviving architecture this is usually the cheapest performance win and the one agents reintroduce by composing services naively.",
    defaultCleanupPhase: 8,
    workKind: "both",
    prerequisites: [],
    rescanAfter: [],
  },
  {
    id: "E02",
    slug: "repeated-computation",
    title: "Repeated computation",
    category: "E",
    detectionMode: "hybrid",
    description:
      "Pure or expensive work is recomputed in a loop or across layers when a local result would be correct.",
    whyItMatters:
      "Repeated work is often a symptom of missing ownership; fix ownership first, then the leftover hot path.",
    defaultCleanupPhase: 8,
    workKind: "both",
    prerequisites: [],
    rescanAfter: [],
  },
  {
    id: "E03",
    slug: "over-fetching",
    title: "Over-fetching",
    category: "E",
    detectionMode: "hybrid",
    description:
      "Queries, API calls, or aggregates load wide payloads when a narrow projection is what the caller uses.",
    whyItMatters:
      "Over-fetching couples consumers to unused fields and makes later representation cleanup harder.",
    defaultCleanupPhase: 8,
    workKind: "both",
    prerequisites: ["A06"],
    rescanAfter: [],
  },
  {
    id: "E04",
    slug: "serialization-overhead",
    title: "Serialization overhead",
    category: "E",
    detectionMode: "hybrid",
    description:
      "Data is encoded, copied, or mapped through several representations in a single path without a boundary that requires it.",
    whyItMatters:
      "Each extra mapping is another place for A06 to hide and a cost that disappears if representations are canonicalized first.",
    defaultCleanupPhase: 8,
    workKind: "both",
    prerequisites: ["A06"],
    rescanAfter: [],
  },
  {
    id: "E05",
    slug: "unnecessary-sequential-io",
    title: "Unnecessary sequential I/O",
    category: "E",
    detectionMode: "hybrid",
    description:
      "Independent I/O waits in sequence — serial awaits, sequential HTTP, or staged disk reads that have no data dependency.",
    whyItMatters:
      "Sequential I/O is easy for agents to write and expensive at runtime once the design is otherwise sound.",
    defaultCleanupPhase: 8,
    workKind: "both",
    prerequisites: [],
    rescanAfter: [],
  },
  {
    id: "E06",
    slug: "algorithmic-complexity",
    title: "Algorithmic complexity",
    category: "E",
    detectionMode: "hybrid",
    description:
      "A hot path uses a more expensive algorithm or data structure than the actual size and access pattern require.",
    whyItMatters:
      "This is last because the right algorithm on the wrong architecture is wasted work, and because it is easy to overfit a micro-benchmark.",
    defaultCleanupPhase: 8,
    workKind: "both",
    prerequisites: [],
    rescanAfter: [],
  },
];

export const RULES_BY_ID: { readonly [K in RuleId]: Rule } = Object.fromEntries(
  RULES.map((rule) => [rule.id, rule]),
) as { readonly [K in RuleId]: Rule };

export const CATEGORIES_BY_ID = Object.fromEntries(
  CATEGORIES.map((category) => [category.id, category]),
) as { readonly [K in Rule["category"]]: RuleCategory };
