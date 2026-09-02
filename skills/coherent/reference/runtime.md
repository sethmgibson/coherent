# Runtime compatibility

This packaged skill requires workflow revision **2** and detector revision
**9**. Before a full cleanup, run the exact CLI that will perform the
work and require every capability used by this playbook:

```bash
coherent version . --json --expect-workflow 2 --expect-detector 9 --require-capability canonical-skill-path doctor-ref doctor-staged inspect-terminal-state review-aware-check review-queue self-describing-json
```

If this command is missing or exits non-zero, stop before `doctor`, `inspect`, baseline,
or review writes. Inspect the reported package path and the target lockfile revision, then
update either the skill or CLI so they describe one workflow. A shared package version alone
is not sufficient evidence when Git dependencies can resolve different commits.

The JSON report exposes `runtime.skillPath`. Editor adapters should load that exact file
instead of guessing that the target repository contains a `skills/coherent` checkout.

The required capabilities are: `canonical-skill-path`, `doctor-ref`, `doctor-staged`, `inspect-terminal-state`, `review-aware-check`, `review-queue`, `self-describing-json`.
