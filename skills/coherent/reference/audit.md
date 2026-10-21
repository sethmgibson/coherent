# Targeted evidence and audit

The agent interprets source evidence and chooses worthwhile work. An ordinary
review or improvement does not require initialization, a baseline, a persistent
review or a cleanup plan. Use search/compiler/test tools directly when simpler.

For selected mechanical assistance:

```bash
coherent version . --json --require-capability targeted-evidence
coherent audit . --evidence --paths src/orders --rules A06 --json
coherent audit . --evidence --paths src/orders/state.ts --rules A03 --json
```

`--paths` accepts existing repository-relative files/directories. `--rules`
selects supported rule IDs; IDs are tool parameters, not user vocabulary. With
no selection, evidence mode runs duplicate-representation checks (A06), not the
entire heuristic catalog. Paths outside the repository are rejected. A scoped
result never establishes repository-wide reachability or cleanliness.

The evidence JSON envelope contains `runtime`, `scope` and `observations`.
Each observation gives its rule/name, identity, confidence, detection mode,
explanation, source evidence, locations and symbols. There are no fingerprints,
review states, priority scores, cleanup prerequisites or terminal-state claims.
No baseline, decisions or architecture document is required or parsed.
Explicit `--output path` writes only the requested result; acknowledgements go
to stderr so JSON stdout stays parseable. Missing Python support or unreadable
in-scope inputs fail clearly; unused language analyzers are not required.

Broad string repetition, wrapper counts, catch shapes and performance patterns
are targeted investigative aids, not default work queues. Trace ownership,
producer/parser/consumer contracts and observable error/recovery state. Do not
turn a residual heuristic into a dismissal bookkeeping task.

## Existing advanced audit

`coherent audit`, `--json` and `--compact-json` without `--evidence` retain their
legacy full-scan Finding shapes, groups and metrics for advanced consumers.
They still write no metadata without `--output`. `--paths` and `--rules` require
`--evidence`; they cannot accidentally turn a legacy full-audit assertion into
a partial result. See [full-cleanup.md](full-cleanup.md) for explicit managed
cleanup and [semantic-triage.md](semantic-triage.md) for optional broader review.
