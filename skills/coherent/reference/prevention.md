# Ordinary feature work

Ask: did this change make the relevant workflow harder to understand or change?
Inspect the diff and affected contracts, not the whole legacy repository.

Before adding, search for the existing owner, representation, helper and native
capability. Look for parallel paths, redundant models, policy-free wrappers,
unowned context fields, invariant patches and dependencies with no real need.
After implementing, check what became obsolete.

For affected data paths, check whether existing authoritative inputs or simple
calculations can replace a read, whether query count grows per item, and whether
fields, collections or inactive consumers load unnecessarily. Check superseded
requests, collection/concurrency bounds, rebuild/refresh triggers and individual
query cost when relevant. Follow
[data-access.md](data-access.md) when one of these probes warrants investigation;
preserve authorization, completeness, freshness and unknown-value semantics.

Follow the default skill and [fix-safety.md](fix-safety.md). Existing architecture
is context, not proof that a layer is necessary. A baseline or persisted review
is never required for ordinary feature work. Do not run `baseline`, `review`,
`check` or `doctor` as an automatic feature-work sequence.

A team may explicitly configure baseline/CI prevention through
[check.md](check.md) and the advanced workflow. Honor those repository-required
gates, but do not silently install hooks or enroll a project because state files
exist. `check` success means its gate passed, not that behavior or architecture
is correct.
