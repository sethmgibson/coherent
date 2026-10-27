import { CATEGORIES, RULES } from "./rules.js";
import { PHASES } from "./phases.js";
import type { Rule } from "./types.js";

export const GENERATED_BANNER =
  "<!-- Generated from src/catalog. Do not edit by hand. Run pnpm generate:skill-docs -->";

export function renderTaxonomyMarkdown(): string {
  const rows = RULES.map(
    (rule) =>
      `| ${rule.id} | ${rule.slug} | ${rule.title} | ${rule.detectionMode} | ${rule.defaultCleanupPhase} | ${rule.workKind} |`,
  ).join("\n");

  const categories = CATEGORIES.map((category) => {
    const rules = RULES.filter((rule) => rule.category === category.id);
    const body = rules.map(renderRuleSection).join("\n");
    return `## ${category.id}. ${category.title}\n\n${category.summary}\n\n${body}`;
  }).join("\n");

  return `${GENERATED_BANNER}

# Taxonomy

The table order is the default conversational review sequence: inspect one
problem class, offer fixes, then suggest the next. Explicit targets override
that sequence. Rule IDs are stable identifiers, **not** cleanup execution
order. The coding agent owns sequencing and identifies real prerequisites from
source evidence. Phase, work-kind, prerequisite and re-scan fields remain legacy
catalog data for import compatibility; no scheduler executes them.
See [cleanup-phases.md](cleanup-phases.md).

Source of truth: \`src/catalog/rules.ts\`.

| ID | Slug | Title | Detection | Phase | Work |
|---|---|---|---|---|---|
${rows}

Detection modes:

- **deterministic** — conclude only from mechanical evidence. Never upgrade a semantic question into a fake deterministic result.
- **semantic** — requires human or agent judgment about meaning, ownership, or intent.
- **hybrid** — mechanical signals exist, but the conclusion still needs judgment.

${categories}
`;
}

export function renderCleanupPhasesMarkdown(): string {
  const phases = PHASES.map((phase) => {
    const sequence =
      phase.sequence.length > 0
        ? phase.sequence.join(" → ")
        : "(no rules — inventory, entrypoints, tests, baseline)";
    return `## Phase ${phase.id} — ${phase.title}

\`${phase.slug}\`

${phase.summary}

Default sequence: ${sequence}
`;
  }).join("\n");

  return `${GENERATED_BANNER}

# Legacy cleanup phases

The phase catalog remains available for public import compatibility. Its
historical ordering is informational. Coherent no longer builds cleanup DAGs,
scores work, or chooses the next fix; the coding agent owns cleanup sequencing.
These phases are not prerequisites or an execution schedule.

Dead-code reduction (A08) happens early so later analysis has less surface.
It is re-run after stale-compatibility removal, after canonicalization, and
after architecture collapse because those edits unlock newly unused code.

${phases}
`;
}

function renderRuleSection(rule: Rule): string {
  const prerequisites =
    rule.prerequisites.length > 0 ? rule.prerequisites.join(", ") : "none";
  const rescan = rule.rescanAfter.length > 0 ? rule.rescanAfter.join(", ") : "none";
  return `### ${rule.id} ${rule.title}

- Slug: \`${rule.slug}\`
- Detection: ${rule.detectionMode}
- Default phase: ${rule.defaultCleanupPhase}
- Work: ${rule.workKind}
- Prerequisites: ${prerequisites}
- Re-scan after: ${rescan}

${rule.description}

Why it matters: ${rule.whyItMatters}
`;
}
