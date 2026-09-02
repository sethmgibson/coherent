# `audit`

Find maintainability issues. Do not fix them here.

## Mechanical step

```bash
coherent audit
coherent audit --json
coherent audit --compact-json
coherent audit --output path/to/audit.json
```

The CLI inventories the target, reads architecture context if present, builds one TypeScript analysis context, and resolves modules with the owning repository tsconfig (including inherited options, path aliases, and child configs in project-reference workspaces). When `.py` files are in scope it also runs the packaged Python stdlib-`ast` sidecar as an explicit subprocess of the Node CLI host. It fails closed if those files are in scope and no supported CPython 3.9+ interpreter exists, and it identifies Python syntax errors by file and line. The sidecar receives file paths as JSON, so paths with spaces stay intact, and it writes no pycache or other caches. Inventory skips `__pycache__`, `site-packages`, and local virtualenv directories (names ending in `venv`). It runs the implemented detectors, merges duplicate fingerprints (union locations, occurrence evidence), groups findings, and computes metrics. It writes nothing by default and generates no tsconfig or cache. `--json` prints the full result. `--compact-json` prints minified totals by rule plus one review-focused copy of each finding: fingerprint, rule, identity, status, severity, confidence, detection mode, evidence, and locations. It omits duplicated status arrays, groups, metrics, catalog-derived prose, and planner fields. `--output` writes the selected full or compact JSON shape to the explicit path. Fingerprints are unique. Do not combine `--json` and `--compact-json`.

Implemented detectors cover dead code, stale compatibility, implicit string protocols, duplicate representations, premature abstraction, excessive indirection, boolean and context-object explosion, swallowed errors, dependency creep, redundant database access, unnecessary sequential I/O, and algorithmic complexity. Other catalog entries remain semantic.

Dead-code analysis separates test-only references from production static use.
Test-only findings remain candidates, including public APIs. Nest registration
analysis follows exact provider tokens and constructor bindings within visible
module scopes; proven registered consumers are not reported as unused. Opaque
or ambiguous bindings remain conservative. Python dead-code reports only
mechanically certain unreachable statements; it does not treat missing static
references as deletion evidence. See [Dead code](rules/A08.md) for
supported patterns and limits.

Mechanical findings are regenerated on demand. Record agent decisions with `coherent review`. Author semantic-only findings in the `findings` array of `.coherent/decisions.json`. `coherent plan` merges current mechanical findings with those durable decisions.

`audit` deliberately shows raw detector status, not review disposition. A
reviewed repository can therefore have non-zero audit signals. Use `plan` for
actionability and its reviewed signal summary; zero plan nodes is the clean
terminal state.

JSON modes keep stdout machine-readable even with `--output`; the write
acknowledgement goes to stderr. The same output-channel contract applies to
`plan --json --output`.

## Agent step

Follow [semantic-audits.md](semantic-audits.md). Cleanup order is not taxonomy order. See [cleanup-phases.md](cleanup-phases.md) and [cleanup-planning.md](cleanup-planning.md).
