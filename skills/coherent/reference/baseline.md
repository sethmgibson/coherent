# `baseline`

Record a starting point so later cleanup and feature work can be judged.

```bash
coherent baseline
```

This runs a fresh audit and writes `.coherent/baseline.json` with schema,
fingerprint, release-wide detector, and per-rule detector revisions plus the
fingerprint, rule, identity, files, and symbols for each finding. Commit the
baseline. Line numbers are not part of identity. The file is portable: it must
not store an absolute machine path.

If the existing baseline has the same versions and findings, the command
reports it unchanged and preserves its timestamp and bytes. Do not reset a
current baseline merely because a full cleanup run mentions every command.

If `check` or `doctor` reports a stale baseline (version skew), re-run this
command. A detector-only change refreshes entries for affected rules and
preserves unrelated baseline history. Schema or fingerprint incompatibility
requires a full refresh. Do not treat version skew as a flood of NEW findings.

Existing debt is allowed. New debt is what `check` compares against. A repository with a thousand old findings must remain usable after this command.
