# Runtime compatibility

The CLI is optional for bounded skill work. For targeted evidence, check only
`coherent version . --json --require-capability targeted-evidence` on the actual runtime.
No state migration is required to inspect source.

The advanced persistent workflow requires workflow revision **2** and detector revision
**11**. Before a full cleanup, run the exact CLI that will perform the
work and require every capability used by this playbook:

```bash
coherent version . --json --expect-workflow 2 --expect-detector 11 --require-capability canonical-skill-path doctor-ref doctor-staged inspect-terminal-state review-aware-check review-queue self-describing-json python-ast targeted-evidence evidence-bound-reviews context-migration
```

If this command is missing or exits non-zero, stop before `doctor`, `inspect`, baseline,
or review writes. Inspect the reported package path and the target lockfile revision, then
update either the skill or CLI so they describe one workflow. A shared package version alone
is not sufficient evidence when Git dependencies can resolve different commits.

The JSON report exposes `runtime.skillPath`. Editor adapters should load that exact file
instead of guessing that the target repository contains a `skills/coherent` checkout.

The required capabilities are: `canonical-skill-path`, `doctor-ref`, `doctor-staged`, `inspect-terminal-state`, `review-aware-check`, `review-queue`, `self-describing-json`, `python-ast`, `targeted-evidence`, `evidence-bound-reviews`, `context-migration`.
