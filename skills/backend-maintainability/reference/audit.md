# `audit`

Find maintainability issues. Do not fix them here.

## Mechanical step

```bash
coherent audit
coherent audit --json
```

The CLI inventories the target, reads architecture context if present, builds one TypeScript analysis context, runs the implemented detectors, groups findings, computes metrics, and writes `.backend/findings.json` with confirmed and candidates separated.

Implemented detectors: A08, A07, A03, A06, B03, B04, C03, C04, D03, D01, E01, E05, E06. Other catalog rules remain semantic.

## Agent step

Follow [semantic-audits.md](semantic-audits.md). Cleanup order is not taxonomy order. See [cleanup-phases.md](cleanup-phases.md) and [cleanup-planning.md](cleanup-planning.md).
