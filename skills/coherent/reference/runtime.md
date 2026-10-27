# Runtime compatibility

The CLI is optional for bounded skill work. For targeted evidence, check only
`coherent version . --json --require-capability targeted-evidence` on the actual runtime.
No state migration is required to inspect source.

Persistent review and CI tools require workflow revision **3** and detector revision
**11**. Use the exact CLI that will perform those operations
and require every capability used by this playbook:

```bash
coherent version . --json --expect-workflow 3 --expect-detector 11 --require-capability canonical-skill-path doctor-ref doctor-staged review-aware-check review-queue self-describing-json python-ast targeted-evidence evidence-bound-reviews context-migration
```

If this command is missing or exits non-zero, stop before `doctor`, baseline,
or review writes. Inspect the reported package path and the target lockfile revision, then
update either the skill or CLI so they describe one workflow. A shared package version alone
is not sufficient evidence when Git dependencies can resolve different commits.

The JSON report exposes `runtime.skillPath`. Editor adapters should load that exact file
instead of guessing that the target repository contains a `skills/coherent` checkout.

The required capabilities are: `canonical-skill-path`, `doctor-ref`, `doctor-staged`, `review-aware-check`, `review-queue`, `self-describing-json`, `python-ast`, `targeted-evidence`, `evidence-bound-reviews`, `context-migration`.

Workflow revision 3 retires `plan`, `fix next` and `inspect`. Those commands
return a non-zero retirement error without scanning or writing project state.
The coding agent owns cleanup sequencing. Detector, fingerprint and stored-state
schema versions are unchanged; no review-history migration is required.
