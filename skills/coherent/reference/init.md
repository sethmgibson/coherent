# Optional architecture context

A bounded task uses existing project guidance; missing context does not require
initialization. When the user requests a Coherent architecture starter:

```bash
coherent init
```

New files focus on ownership, invariants, external boundaries, intentional
distinctions and compatibility consumers. Unknown knowledge stays incomplete;
no layers or design are invented. The starter has no volatile inventory counts
or discovered-fact fences to maintain. Complete only source-supported facts as
[architecture-analysis.md](architecture-analysis.md) describes.

Existing architecture files stay unchanged. `init --force` and `refresh` keep
legacy fenced inventory updates compatible, never overwrite authored prose,
and leave focused context byte-for-byte unchanged. A baseline, audit and review
queue are not next-step requirements. See [migration.md](migration.md) for an
explicit preview of converting older context.

`.backend/` is still read when it is the only legacy location. Neither ordinary
work nor migration silently renames/removes directories or user files.
