# `plan`

Turn findings into a cleanup DAG. Do not sort by rule ID, severity, or phase alone.

```bash
coherent plan
coherent plan --json
coherent plan --output path/to/plan.json
coherent plan --performance
```

The CLI runs a fresh audit, applies reviews and semantic findings from `.coherent/decisions.json`, groups the merged set, adds prerequisite and re-scan edges, and scores unlocked nodes. It writes nothing by default and does not execute the plan. Use `--output` only when a persistent JSON export is explicitly useful.

The rendered plan includes detected, advisory, dismissed, confirmed, deferred,
and awaiting-review counts. E01, E05, and E06 heuristics are advisory by
default because static evidence rarely establishes a worthwhile performance
change. Use `--performance` only when performance work is in scope; advisory
signals remain visible in the audit and review queue but do not make the
ordinary cleanup DAG non-clean. The raw audit can remain non-zero after
reviewed dismissals; zero plan nodes means the reviewed in-scope repository is
clean.

Merge rules:

- Dismissed findings are absent from the DAG. Mechanical and hybrid dismissals require the current detector revision for that rule, including exact fingerprint matches. An unrelated rule change does not invalidate them. Pure-semantic exact reviews may survive detector bumps. Identity fallback requires `ruleId` + `identity` and the current per-rule revision.
- Deferred findings stay visible as `deferred` and are not `fix next` targets.
  Their reason, missing evidence, and reconsider condition appear on the plan.
  Use `coherent review queue` for item-level unreviewed / deferred / ready groups.
- Hybrid and semantic findings without a `confirmed` review are `needs_review`.
- All candidates, including deterministic A08 unused exports and registrations, stay `needs_review` until confirmed. Only confirmed deterministic findings are ready without an explicit review.
- An allowed conclusion such as “intentionally different” must be a review, not only architecture prose.

Follow [cleanup-planning.md](cleanup-planning.md) and [semantic-audits.md](semantic-audits.md). Next command is usually `coherent fix next`.
