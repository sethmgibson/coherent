import type { RuleId } from "./rules.js";

/**
 * Default cleanup phase order. Taxonomy IDs, audit order, cleanup
 * execution, and finding prerequisites are not the same thing.
 * The planner builds a finding-specific DAG; these phases only
 * break ties when dependencies are otherwise equal.
 */
export const PHASES = [
  {
    id: 0,
    slug: "safety-and-understanding",
    title: "Safety and understanding",
    summary:
      "Inventory the repository, entrypoints, critical workflows, and available behavioral tests. Establish a baseline before changing behavior. This phase is not a rule.",
    sequence: [],
  },
  {
    id: 1,
    slug: "mechanical-reduction",
    title: "Mechanical reduction",
    summary:
      "Remove dead code, then stale compatibility, then dead code again. Stay conservative around dependency injection, decorators, reflection, CLI and framework registration, dynamic imports, background jobs, public APIs, and package exports. Do not delete uncertain code merely because static references are absent.",
    sequence: ["A08", "A07", "A08"],
  },
  {
    id: 2,
    slug: "semantic-truth",
    title: "Establish semantic truth",
    summary:
      "Build an accurate model of architecture, terminology, and implicit protocols. Do not auto mass-rename or redesign protocols.",
    sequence: ["A01", "A02", "A03"],
  },
  {
    id: 3,
    slug: "canonicalize",
    title: "Canonicalize concepts",
    summary:
      "Collapse duplicate implementations, parallel abstractions, and duplicate representations, then re-scan for newly dead code.",
    sequence: ["A04", "A05", "A06", "A08"],
  },
  {
    id: 4,
    slug: "collapse-architecture",
    title: "Collapse accidental architecture",
    summary:
      "Remove additive architecture, generic infrastructure, premature abstractions, extra indirection, helper sprawl, and layer violations. Fix surviving boundaries afterward. Re-scan dead code.",
    sequence: ["B01", "B02", "B03", "B04", "B05", "B06", "A08"],
  },
  {
    id: 5,
    slug: "repair-domain",
    title: "Repair domain and control-flow design",
    summary:
      "Fix downstream invariant patches, feature overfitting, boolean-state explosion, context-object explosion, and distributed workflow complexity.",
    sequence: ["C01", "C02", "C03", "C04", "C05"],
  },
  {
    id: 6,
    slug: "repair-reliability",
    title: "Repair failure semantics and tests",
    summary:
      "Repair defensive programming, swallowed errors, implementation-coupled tests, and mock explosion. Dependency cleanup is a later phase.",
    sequence: ["D02", "D03", "D04", "D05"],
  },
  {
    id: 7,
    slug: "dependency-cleanup",
    title: "Dependency cleanup",
    summary:
      "Remove dependency creep only after architecture and call sites have settled, so unused packages are actually unused.",
    sequence: ["D01"],
  },
  {
    id: 8,
    slug: "performance",
    title: "Performance",
    summary:
      "Address performance only on architecture that survived earlier phases. Do not optimize code that should be deleted.",
    sequence: ["E01", "E02", "E03", "E04", "E05", "E06"],
  },
] as const satisfies readonly {
  id: number;
  slug: string;
  title: string;
  summary: string;
  sequence: readonly RuleId[];
}[];

export type PhaseId = (typeof PHASES)[number]["id"];
export type CleanupPhase = (typeof PHASES)[number];
export const PHASE_IDS = PHASES.map((phase) => phase.id) as readonly PhaseId[];

export const PHASES_BY_ID: Readonly<Record<CleanupPhase["id"], CleanupPhase>> =
  Object.fromEntries(PHASES.map((phase) => [phase.id, phase])) as Record<
    CleanupPhase["id"],
    CleanupPhase
  >;
