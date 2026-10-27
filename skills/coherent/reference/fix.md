# `fix next` — retired

The coding agent owns cleanup sequencing. `coherent fix next` returns a
non-zero retirement error without reading source, changing review history, or
writing output files. `--json` returns an `error` object with code
`scheduler_retired`; it never returns a successful plan or clean terminal state.

Use [audit.md](audit.md) for evidence, `review queue` for recorded judgments,
and [check.md](check.md) for CI drift. Follow the conversational skill for
investigation and requested fixes. See [full-cleanup.md](full-cleanup.md) only
when persistent reviews or CI checks are explicitly selected.
