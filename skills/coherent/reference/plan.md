# `plan`

Turn findings into a cleanup DAG. Do not sort by rule ID, severity, or phase alone.

```bash
coherent plan
coherent plan --json
```

The CLI runs a fresh audit, applies `.coherent/reviews.json` onto those findings, appends `.coherent/semantic-findings.json`, groups the merged set, adds prerequisite and re-scan edges, scores unlocked nodes, and writes `.coherent/plan.json`. It does not execute the plan.

Merge rules:

- Dismissed findings are absent from the DAG.
- Deferred findings stay visible as `needs_review` and are not `fix next` targets.
- Hybrid and semantic findings without a `confirmed` review are `needs_review`.
- Deterministic candidates (A08 unused-export) stay selectable, as before.
- An allowed conclusion such as “intentionally different” must be a review, not only architecture prose.

Follow [cleanup-planning.md](cleanup-planning.md) and [semantic-audits.md](semantic-audits.md). Next command is usually `coherent fix next`.
