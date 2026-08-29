# `init`

Create durable architecture context. Do not invent a design.

## Mechanical step

```bash
coherent init
coherent refresh
coherent init --force
```

`backend init` is the same command. `--force` and `refresh` replace only `<!-- coherent:discovered -->` interiors from the current inventory. They must not overwrite confirmed semantic prose, including mixed-section addenda. Never silently overwrite a completed `ARCHITECTURE.md`.

The CLI writes:

- `.coherent/inventory.json` — regenerable snapshot
- `.coherent/ARCHITECTURE.md` — durable context that should be committed

If only `.backend/` exists, the CLI uses it for this run and tells you to rename it to `.coherent/`. If both exist, it uses `.coherent/` and warns about the leftover directory.

It fills only what inventory can know: packages, frameworks, source and test directories, entrypoints, declared exports, observed persistence libraries, approximate size. Those facts are fenced. Everything else is marked incomplete.

## Semantic step

Follow [architecture-analysis.md](architecture-analysis.md). Write confirmed facts. Label inferences. Recommend `/coherent audit` next, then `baseline` before destructive cleanup.
