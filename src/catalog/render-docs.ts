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

Rule IDs are stable identifiers. Rule ID order is **not** cleanup execution
order. See [cleanup-phases.md](cleanup-phases.md).

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

# Cleanup phases

Taxonomy, audit order, cleanup execution, and finding prerequisites are not
the same. The cleanup DAG is authoritative for actual work. These default
phases only break ties when dependencies are otherwise equal.

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
