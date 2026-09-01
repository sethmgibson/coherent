# Prevention

For ordinary feature work. Do not run a full legacy cleanup audit for every small change.

The question to answer: **Did this feature make the system conceptually harder to change?**

After the feature lands:

```bash
coherent check --changed
coherent check
```

`check --changed` compares a scoped audit (git-diff files plus importers) to the committed baseline. Use unscoped `check` when you want a full-repo comparison. Existing debt does not fail. New confirmed high or critical **deterministic** findings fail. Hybrid and candidate findings are printed and do not fail by default. Resolved findings are reported only when they fall inside the scoped files.

Read `Gate` and `Drift` separately. Review-state counts distinguish ready,
unreviewed, deferred, dismissed, and identity matches that require a full scan.
Do not translate exit code 0 into “no drift” or “clean.”

Then inspect the **diff**, not the whole legacy tree, for new architecture debt:

- Parallel implementation of an existing concept
- Duplicate representation of existing information
- Wrapper or layer that adds no policy
- Compatibility path without a documented consumer and removal condition
- Helper that duplicates existing behavior
- Downstream invariant patch
- New boolean mode that is not part of a state model
- Context or options object growth
- Layer violation
- Dependency overlap or a package the language already covers
- Swallowed error
- Obvious query or complexity regression

If `.coherent/baseline.json` is missing, run `coherent baseline` once so later checks have a comparison point. A large existing repository must remain usable on day one: old findings are allowed; new debt is what `check` exists to catch.

## Before you add

Search for an existing authoritative concept, representation, helper, and dependency. Ask whether a new boolean extends an existing state model, whether a fallback exists because an invariant is unenforced, and whether a new layer has a responsibility that cannot live in an existing one. After implementing, search for code the change made obsolete.

See the Cursor rule template at [../adapters/cursor/prevention.mdc](../adapters/cursor/prevention.mdc) if you want this as a project rule. The methodology does not depend on Cursor.
