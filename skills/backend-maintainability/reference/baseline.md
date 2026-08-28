# `baseline`

Record a starting point so later cleanup and feature work can be judged.

```bash
coherent baseline
```

This runs a fresh audit and writes `.backend/baseline.json` with fingerprint, rule, identity, files, and symbols for each finding. Commit the baseline. Line numbers are not part of identity.

Existing debt is allowed. New debt is what `check` compares against. A repository with a thousand old findings must remain usable after this command.
