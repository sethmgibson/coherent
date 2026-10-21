# Durable architecture context

Reuse existing project guidance first. Missing `.coherent/ARCHITECTURE.md` does
not block a bounded task. Write context only when requested, or when an
implemented change genuinely changes established ownership or invariants.

Capture only knowledge worth retaining:

- Purpose and ownership of important concepts and data.
- Authoritative representations and producer/parser/consumer boundaries.
- Behavioral invariants, external effects, recovery and delivery ownership.
- Intentional distinctions that similar names or shapes must not erase.
- Compatibility consumers, purpose and removal conditions.

Inspect the relevant entrypoints and representative workflows; do not read
all files or complete a taxonomy checklist. State uncertainty and omit sections
that do not apply. Source code and tests must support architectural assertions.

Do not maintain file/line counts, dependency totals, regenerable inventories,
scan results, review ledgers or completed-finding histories here. Those are
recomputable or belong to an explicitly selected advanced workflow.

`coherent init` explicitly creates a small context starter. Existing legacy
inventory documents are left intact; `refresh` preserves authored text. See
[migration.md](migration.md) for an explicit preview of removing managed
inventory sections without deleting stored baseline/review state.
