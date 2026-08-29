# Rule playbooks

Investigation procedures for the 30 catalog rules. Catalog metadata
(description, why it matters, phase, work kind, prerequisites, rescan edges)
lives in [taxonomy.md](../taxonomy.md) and is generated from
`src/catalog/rules.ts`. Do not copy those fields here.

Method: [semantic-audits.md](../semantic-audits.md). These files do not add a
second methodology. Read `.coherent/ARCHITECTURE.md`, run `coherent audit`,
inspect only the files the findings or architecture point to, then record a
conclusion.

## How to record a conclusion

Mechanical evidence is regenerated in `.coherent/findings.json`. Do not edit
that file by hand.

### Hybrid and deterministic findings → `reviews.json`

Adjudicate an existing finding. Match `fingerprint`, else `ruleId` +
`identity`.

```json
{
  "schemaVersion": 1,
  "reviews": [
    {
      "fingerprint": "<from findings.json>",
      "ruleId": "A06",
      "identity": "duplicate-rep:CleanupPhase+RuleCategory",
      "decision": "dismissed",
      "reason": "Share id/title/summary by coincidence. Taxonomy grouping is not a cleanup phase.",
      "reviewedAt": "2026-08-28T00:00:00.000Z",
      "semanticEquivalence": "Superficially similar but intentionally different; do not merge.",
      "authoritativeConcept": "Keep both: RuleCategory and CleanupPhase."
    }
  ]
}
```

`decision`:

- `confirmed` — real issue; eligible for plan work after review
- `dismissed` — not an issue, or intentionally different; dropped from the DAG
- `deferred` — keep visible; not ready

Prefer `coherent review confirm|dismiss|defer <fingerprint>` when that command
exists. Do not invent a parallel review schema.

### Semantic-only findings → `semantic-findings.json`

Use this when there is no mechanical finding to review: semantic rules, hybrid
rules that have no detector yet, or a real issue the detector missed.

```json
{
  "schemaVersion": 1,
  "findings": []
}
```

Each entry is a `Finding`. Fill the fields listed in
[semantic-audits.md](../semantic-audits.md). Compute fingerprints with
`createFinding` if you omit them. `identity` is a stable evidence key — no
line numbers. Leave optional fields absent rather than inventing certainty.

Do not write a semantic finding solely to record a “do not merge” result.
Record that distinction in `.coherent/ARCHITECTURE.md` (canonical terminology
or authoritative representations) so later agents do not reopen it.

### Successful “do not merge”

This is a complete audit outcome:

> Superficially similar but intentionally different; do not merge.

Hybrid/mechanical: `dismissed` in `reviews.json` with `semanticEquivalence` and
`authoritativeConcept`. Semantic-only: architecture note only.

Never consolidate two concepts solely because they have similar shapes.
Never keep a layer solely because many files already use it.

## Index

| ID | Playbook | Detection | Record |
|---|---|---|---|
| A01 | [A01.md](A01.md) | semantic | `semantic-findings.json` |
| A02 | [A02.md](A02.md) | semantic | `semantic-findings.json` |
| A03 | [A03.md](A03.md) | hybrid | `reviews.json` |
| A04 | [A04.md](A04.md) | hybrid | review if present; else semantic |
| A05 | [A05.md](A05.md) | hybrid | review if present; else semantic |
| A06 | [A06.md](A06.md) | hybrid | `reviews.json` |
| A07 | [A07.md](A07.md) | hybrid | `reviews.json` |
| A08 | [A08.md](A08.md) | deterministic | `reviews.json` |
| B01 | [B01.md](B01.md) | semantic | `semantic-findings.json` |
| B02 | [B02.md](B02.md) | semantic | `semantic-findings.json` |
| B03 | [B03.md](B03.md) | hybrid | `reviews.json` |
| B04 | [B04.md](B04.md) | hybrid | `reviews.json` |
| B05 | [B05.md](B05.md) | hybrid | review if present; else semantic |
| B06 | [B06.md](B06.md) | hybrid | review if present; else semantic |
| C01 | [C01.md](C01.md) | semantic | `semantic-findings.json` |
| C02 | [C02.md](C02.md) | semantic | `semantic-findings.json` |
| C03 | [C03.md](C03.md) | hybrid | `reviews.json` |
| C04 | [C04.md](C04.md) | hybrid | `reviews.json` |
| C05 | [C05.md](C05.md) | semantic | `semantic-findings.json` |
| D01 | [D01.md](D01.md) | hybrid | `reviews.json` |
| D02 | [D02.md](D02.md) | hybrid | review if present; else semantic |
| D03 | [D03.md](D03.md) | hybrid | `reviews.json` |
| D04 | [D04.md](D04.md) | hybrid | review if present; else semantic |
| D05 | [D05.md](D05.md) | hybrid | review if present; else semantic |
| E01 | [E01.md](E01.md) | hybrid | `reviews.json` |
| E02 | [E02.md](E02.md) | hybrid | review if present; else semantic |
| E03 | [E03.md](E03.md) | hybrid | review if present; else semantic |
| E04 | [E04.md](E04.md) | hybrid | review if present; else semantic |
| E05 | [E05.md](E05.md) | hybrid | `reviews.json` |
| E06 | [E06.md](E06.md) | hybrid | `reviews.json` |
