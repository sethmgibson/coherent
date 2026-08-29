# `baseline`

Record a starting point so later cleanup and feature work can be judged.

```bash
coherent baseline
```

This runs a fresh audit and writes `.coherent/baseline.json` with schema and detector versions plus fingerprint, rule, identity, files, and symbols for each finding. Commit the baseline. Line numbers are not part of identity. The file is portable: it must not store an absolute machine path.

If `check` or `doctor` reports a stale baseline (version skew), re-run this command. Do not treat version skew as a flood of NEW findings.

Existing debt is allowed. New debt is what `check` compares against. A repository with a thousand old findings must remain usable after this command.
