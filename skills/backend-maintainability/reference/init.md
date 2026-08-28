# `init`

Create durable architecture context. Do not invent a design.

## Mechanical step

```bash
coherent init
```

`backend init` is the same command. Use `--force` only when the user wants discovered sections regenerated. Never silently overwrite a completed `ARCHITECTURE.md`.

The CLI writes:

- `.backend/inventory.json` — regenerable snapshot
- `.backend/ARCHITECTURE.md` — durable context that should be committed

It fills only what inventory can know: packages, frameworks, source and test directories, entrypoints, declared exports, observed persistence libraries, approximate size. Everything else is marked incomplete.

## Semantic step

Follow [architecture-analysis.md](architecture-analysis.md). Write confirmed facts. Label inferences. Recommend `/backend audit` next, then `baseline` before destructive cleanup.
