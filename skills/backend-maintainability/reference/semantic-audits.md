# Semantic audits

Deterministic detectors collect mechanical evidence. Semantic investigation is done by the coding agent using architecture context, those findings, this skill, and targeted code inspection.

A semantic audit may inspect all 30 rules. Audit order may differ from cleanup order. A01, A02, and A03 are often studied early because they improve understanding even when A08 cleanup happens first physically.

Do not overload the user with an unprioritized dump. Separate confirmed findings from candidates. Group related findings. Note prerequisites and findings that may disappear once another cleanup lands.

## Finding format

Every semantic finding should include:

1. Rule ID
2. Severity
3. Confidence
4. Confirmed vs candidate
5. Exact files and symbols
6. Evidence
7. Semantic equivalence analysis
8. Apparent authoritative concept or implementation
9. Deletion or consolidation opportunity
10. Prerequisites
11. What the cleanup unlocks
12. Behavioral / change risk
13. Test and safety evidence

The CLI `Finding` object already has these fields (`semanticEquivalence`, `authoritativeConcept`, `deletionOpportunity`, `unlocks`, `changeRisk`, `testSafetyEvidence`, `prerequisiteFindingIds`). When you add or refine a finding, fill them. Leave them absent rather than inventing certainty.

## Allowed conclusions

You may conclude:

> Superficially similar but intentionally different; do not merge.

That is a successful audit result. Record it in `.backend/ARCHITECTURE.md` (authoritative representations or terminology) so later agents do not reopen the question.

You may also conclude that a hybrid signal is a candidate only, or that evidence is too weak to delete.

## How to investigate

1. Read `.backend/ARCHITECTURE.md` if it exists. If it does not, recommend `init` first.
2. Run `coherent audit`. Do not invent a findings file.
3. Ingest the deterministic findings. Treat `candidate` as a prompt to look, not a license to delete.
4. Inspect only the files, symbols, and workflows the findings or architecture point to. Do not read every file.
5. Group related findings (same file, same concept, same compatibility path).
6. Identify prerequisite relationships from the catalog and from actual callers.
7. Mark findings that would disappear if a higher-value deletion landed first (for example an E06 on a function that is already A08-dead).
8. Write confirmed vs candidate conclusions. Update architecture notes when you establish an authoritative concept.

See [taxonomy.md](taxonomy.md) for rule meanings. See [cleanup-planning.md](cleanup-planning.md) before turning conclusions into work.
