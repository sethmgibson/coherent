# Architecture analysis

Durable context lives in `.coherent/ARCHITECTURE.md`. Inventory facts are regenerable. Do not invent a design.

## What to capture

After `coherent init`, complete only what the tree and the user can confirm:

- System purpose
- Modules, apps, and services
- Domain concepts
- Canonical terminology
- Authoritative representations
- Data ownership
- Invariants
- Persistence boundaries
- External and provider boundaries
- Dependency direction
- Public APIs
- Async boundaries
- Critical workflows
- Legacy and transitional paths

Mark uncertainty explicitly. Omit sections that do not apply.

## How to inspect (do not read every file)

1. Run `coherent init` for the mechanical inventory.
2. Read existing architecture and config files (`ARCHITECTURE.md`, `coherent.json`, tsconfig, package manifests, workspace files).
3. Inspect declared entrypoints, bins, and exports.
4. Inspect workspace and package structure.
5. Inspect major persistence, domain, and external boundaries (clients, stores, provider adapters).
6. Inspect a few representative workflows from those entrypoints — the paths that must keep working during cleanup.
7. Update `.coherent/ARCHITECTURE.md`. Never silently overwrite completed semantic sections.

Phase 0 work also includes: understand important workflows, inspect existing behavioral tests, identify externally reachable boundaries, and establish a baseline (`coherent baseline`) before destructive cleanup.

## Phase 2 — semantic map

A01, A02, and A03 often produce knowledge before code changes. Use them to record:

- Intentional architecture vs historical accidents
- Domain vocabulary
- Protocol and state vocabulary

Do not mass-rename solely because terminology drift was discovered. Rename when it supports an actual consolidation or clarification.
