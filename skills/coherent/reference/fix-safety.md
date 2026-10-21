# Bounded improvement safety

The agent chooses the unit of work from the request, current evidence and
expected benefit. A default improvement requires no baseline, saved confirmation,
DAG, metadata check or exhaustive candidate triage. Advanced `fix next` is a
separate, explicitly selected workflow.

## Before editing

Read project instructions, relevant ownership/invariants, existing changes,
callers, callees, public consumers and tests. Trace producer → parser → consumer.
Preserve distinct protocols, nullability, unknown-value handling and import paths.
For deletion, establish reachability through frameworks, DI, decorators,
reflection, CLI registration, dynamic imports, background jobs and public APIs.

For compatibility, name the actual consumer and removal condition. For external
writes, name the idempotency, recovery and uncertain-outcome boundaries. Carry
user constraints forward; never widen commit, deploy or production authority.

Choose one useful improvement. Related edits may share a validation pass when
contracts, files or tests overlap; preserve separate semantic conclusions. Do
not batch unrelated deletion or manufacture an abstraction to remove a wrapper.

## Validation

Classify the actual change, not its task label:

- **Type-only:** check assignability, callers, serialization contracts, null and
  unknown handling; verify runtime preservation where useful.
- **Refactor:** characterize observable behavior and public/import compatibility.
- **Behavior:** reproduce the old failure and test the corrected outcome plus
  valid controls and recovery.
- **External side effects:** test uncertain responses, retries, lost responses,
  re-entry, stable operation/request IDs, attempts and duplicate-write prevention.
  A scan or byte-identical transpilation is not proof about live providers.

Inspect test prerequisites before a broad run: actual runner, local resource
ownership, DB version/fixture endpoint restrictions and schema readiness. Use
project setup commands; do not repurpose another project's resources.

Run targeted checks while editing, then the normal checks required by the
repository and change risk. Reuse evidence from the same unchanged source.
Additional passes require new changes, failures or unresolved concerns. Keep
old test failures, expected regression reds and new mistakes distinct. Repair
unrelated stale assertions only when justified and report the extra scope.

Reinspect the diff and any code made obsolete. A targeted rescan is useful when
it verifies the original hypothesis; audit/check/plan/doctor are not a mandatory
chain. Do not create reviews to make a noisy residual signal disappear.

## Handoff and stopping

Explain before → after → practical effect, preserved invariants, tests and limits.
Be candid about marginal benefits and no demonstrated performance gain. A fixed
signal count is secondary. Report missing evidence or a concrete blocker when
no safe edit is justified. Complete the bounded outcome and stop.
