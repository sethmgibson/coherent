# `check`

Prevention after ordinary feature development. Compare a fresh audit to the committed baseline and inspect the **diff** for new architecture debt.

```bash
coherent check
coherent check --changed
coherent check --json
```

The CLI reports NEW, EXISTING, and RESOLVED findings, classifies new debt shapes, and asks whether the change made the system conceptually harder to change.

Default exit policy:

- Existing debt does not fail the check.
- New confirmed high or critical **deterministic** findings fail.
- Hybrid and candidate findings are printed and do not fail by default.
- Resolved findings are reported.

`--changed` parses only TypeScript files in the git diff (unstaged, staged, and untracked), plus files that import those modules so A08 can still see callers. It does not write `findings.json`. Findings outside that scope are not reported as RESOLVED. Full `audit` and an unscoped `check` remain explicit.

If `.coherent/baseline.json` is missing, the command exits non-zero and tells you to run `coherent baseline` first. If the baseline schema, fingerprint version, or detector revision does not match this CLI, the command tells you to re-run `coherent baseline` instead of reporting every finding as NEW.

Do not run a full deep legacy cleanup for every small feature. See [prevention.md](prevention.md).
