# `check`

Prevention after ordinary feature development. Compare a fresh audit to the committed baseline and inspect the **diff** for new architecture debt.

```bash
coherent check
coherent check --json
```

The CLI reports NEW, EXISTING, and RESOLVED findings, classifies new debt shapes, and asks whether the change made the system conceptually harder to change.

Default exit policy:

- Existing debt does not fail the check.
- New confirmed high or critical **deterministic** findings fail.
- Hybrid and candidate findings are printed and do not fail by default.
- Resolved findings are reported.

If `.backend/baseline.json` is missing, the command exits non-zero and tells you to run `coherent baseline` first.

Do not run a full deep legacy cleanup for every small feature. See [prevention.md](prevention.md).
