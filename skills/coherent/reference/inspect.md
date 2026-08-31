# `inspect`

Inspect the current cleanup state with one audit snapshot.

```bash
coherent inspect
coherent inspect --json
```

The command runs one audit, reads durable decisions in parallel, applies those
reviews to the exact audit findings, builds the cleanup DAG, and selects the
next ready node. It does not write Coherent metadata.

Plain output contains a compact raw-signal summary, the reviewed plan, and the
same bounded work brief as `fix next`. JSON output contains the compact audit
shape, full plan, and `nextNode`; each audit finding appears only once.

Use `inspect` for the normal full-cleanup loop. Run standalone `audit`, `plan`,
or `fix next` when only that individual view is needed.
