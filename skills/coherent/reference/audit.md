# `audit`

Find maintainability issues. Do not fix them here.

## Mechanical step

```bash
coherent audit
coherent audit --json
coherent audit --compact-json
coherent audit --output path/to/audit.json
```

The CLI inventories the target, reads architecture context if present, builds one TypeScript analysis context, and resolves modules with the owning repository tsconfig (including inherited options, path aliases, and child configs in project-reference workspaces). It runs the implemented detectors, merges duplicate fingerprints (union locations, occurrence evidence), groups findings, and computes metrics. It writes nothing by default and generates no tsconfig or cache. `--json` prints the full result. `--compact-json` prints minified totals by rule plus one review-focused copy of each finding: fingerprint, rule, identity, status, severity, confidence, detection mode, evidence, and locations. It omits duplicated status arrays, groups, metrics, catalog-derived prose, and planner fields. `--output` writes the selected full or compact JSON shape to the explicit path. Fingerprints are unique. Do not combine `--json` and `--compact-json`.

Implemented detectors cover dead code, stale compatibility, implicit string protocols, duplicate representations, premature abstraction, excessive indirection, boolean and context-object explosion, swallowed errors, dependency creep, redundant database access, unnecessary sequential I/O, and algorithmic complexity. Other catalog entries remain semantic.

Mechanical findings are regenerated on demand. Record agent decisions with `coherent review`. Author semantic-only findings in the `findings` array of `.coherent/decisions.json`. `coherent plan` merges current mechanical findings with those durable decisions.

`audit` deliberately shows raw detector status, not review disposition. A
reviewed repository can therefore have non-zero audit signals. Use `plan` for
actionability and its reviewed signal summary; zero plan nodes is the clean
terminal state.

## Agent step

Follow [semantic-audits.md](semantic-audits.md). Cleanup order is not taxonomy order. See [cleanup-phases.md](cleanup-phases.md) and [cleanup-planning.md](cleanup-planning.md).
