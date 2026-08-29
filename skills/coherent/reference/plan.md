# `plan`

Turn findings into a cleanup DAG. Do not sort by rule ID, severity, or phase alone.

```bash
coherent plan
coherent plan --json
coherent plan --output path/to/plan.json
```

The CLI runs a fresh audit, applies reviews and semantic findings from `.coherent/decisions.json`, groups the merged set, adds prerequisite and re-scan edges, and scores unlocked nodes. It writes nothing by default and does not execute the plan. Use `--output` only when a persistent JSON export is explicitly useful.

Merge rules:

- Dismissed findings are absent from the DAG. A dismissal whose fingerprint no longer matches applies only if `ruleId` + `identity` still match and `detectorRevision` is current.
- Deferred findings stay visible as `needs_review` and are not `fix next` targets.
- Hybrid and semantic findings without a `confirmed` review are `needs_review`.
- Deterministic candidates (A08 unused-export) stay selectable, as before.
- An allowed conclusion such as “intentionally different” must be a review, not only architecture prose.

Follow [cleanup-planning.md](cleanup-planning.md) and [semantic-audits.md](semantic-audits.md). Next command is usually `coherent fix next`.
