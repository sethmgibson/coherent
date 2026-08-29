# `audit`

Find maintainability issues. Do not fix them here.

## Mechanical step

```bash
coherent audit
coherent audit --json
```

The CLI inventories the target, reads architecture context if present, builds one TypeScript analysis context, runs the implemented detectors, merges duplicate fingerprints (union locations, occurrence evidence), groups findings, computes metrics, and writes `.coherent/findings.json` with confirmed and candidates separated. Fingerprints in that file are unique.

Implemented detectors: A08, A07, A03, A06, B03, B04, C03, C04, D03, D01, E01, E05, E06. Other catalog rules remain semantic.

`findings.json` is mechanical evidence only. Record agent decisions with `coherent review`. Author semantic-only findings in `.coherent/semantic-findings.json`. `coherent plan` merges those files.

## Agent step

Follow [semantic-audits.md](semantic-audits.md). Cleanup order is not taxonomy order. See [cleanup-phases.md](cleanup-phases.md) and [cleanup-planning.md](cleanup-planning.md).
