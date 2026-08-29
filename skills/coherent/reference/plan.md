# `plan`

Turn findings into a cleanup DAG. Do not sort by rule ID, severity, or phase alone.

```bash
coherent plan
coherent plan --json
coherent plan --output path/to/plan.json
```

The CLI runs a fresh audit, applies reviews and semantic findings from `.coherent/decisions.json`, groups the merged set, adds prerequisite and re-scan edges, and scores unlocked nodes. It writes nothing by default and does not execute the plan. Use `--output` only when a persistent JSON export is explicitly useful.

The rendered plan includes detected, dismissed, confirmed, deferred, and
awaiting-review counts. The raw audit can remain non-zero after reviewed
dismissals; zero plan nodes means the reviewed repository is clean.

Merge rules:

- Dismissed findings are absent from the DAG. Mechanical and hybrid dismissals require the current `detectorRevision`, including exact fingerprint matches. Pure-semantic exact reviews may survive detector bumps. Identity fallback requires `ruleId` + `identity` and the current revision.
- Deferred findings stay visible as `needs_review` and are not `fix next` targets.
- Hybrid and semantic findings without a `confirmed` review are `needs_review`.
- Deterministic candidates (A08 unused-export) stay selectable, as before.
- An allowed conclusion such as “intentionally different” must be a review, not only architecture prose.

Follow [cleanup-planning.md](cleanup-planning.md) and [semantic-audits.md](semantic-audits.md). Next command is usually `coherent fix next`.
