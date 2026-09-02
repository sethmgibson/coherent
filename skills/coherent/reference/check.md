# `check`

Prevention after ordinary feature development. Compare a fresh audit to the committed baseline and inspect the **diff** for new architecture debt.

```bash
coherent check
coherent check --changed
coherent check --json
```

The CLI reports NEW, EXISTING, and RESOLVED findings, classifies new debt
shapes, annotates current findings with their review disposition, and asks
whether the change made the system conceptually harder to change. Gate status
and drift status are separate: a passing prevention gate can still contain
non-failing or reviewed drift.

Default exit policy:

- Existing debt does not fail the check.
- New confirmed high or critical **deterministic** findings fail.
- Hybrid and candidate findings are printed and do not fail by default.
- New E01, E05, and E06 heuristics are labeled `advisory` and are excluded
  from the default conceptual-hardness/debt conclusion. Inspect them when
  performance work is in scope.
- Resolved findings are reported.

`--changed` parses TypeScript and Python files in the git diff (unstaged, staged, and
untracked), plus their transitive importers so A08 can still see callers. Git
paths are relative to the requested target, including nested package roots;
renames include both old and new paths. Import discovery shares full analysis's
TypeScript resolver, including aliases and owning child configs, and uses the
Python sidecar for `.py` importers. Inventory
ignores still apply. Findings outside that scope are not reported as RESOLVED.
Neither scoped nor full checks write Coherent metadata.

Full checks may apply safe identity-based review matching because the complete
peer set is present. Scoped checks apply exact fingerprint reviews only. When
a scoped finding has a possible identity-based review, it is labeled
`requires_full_scan` rather than optimistically applying a decision without
the repository-wide ambiguity check.

Use full `check` for repository-wide conclusions, particularly after changing
package manifests, compiler configuration, or cross-file representations.
No new mechanical findings is not proof of semantic architectural cleanliness.

If `.coherent/baseline.json` is missing, the command exits non-zero and tells you to run `coherent baseline` first. If the baseline schema, fingerprint version, or any per-rule detector revision does not match this CLI, the command tells you to re-run `coherent baseline` instead of reporting every finding as NEW.

Do not run a full deep legacy cleanup for every small feature. See [prevention.md](prevention.md).
