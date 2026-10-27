# Coherent

A conversational maintainability skill for backend and large AI-built
codebases. Start with a review, choose which issues to fix, then keep working
on that class of problems or move to the next. Mechanical tools are optional.

## Start with the skill

```bash
npx --yes --package github:sethmgibson/coherent -- coherent install --skills-only --yes
```

Reload Codex or Cursor, then invoke the skill in chat:

```text
$coherent
```

Use `/coherent` in Cursor, or simply ask for "coherent" when the skill is
available. A fresh general cleanup starts with whole-system simplification:
what is the smallest complete system that could deliver the intended outcomes?
The agent looks for unnecessary workflows, pages, capabilities, and subsystems,
then reports concrete proposals. Choose to investigate further, implement a
proposal, or move on to architecture fossilization.

After each requested fix, the agent offers to stay with those issues or review
the next class. Say "fix the first one", "keep looking", or "next"; no rule IDs
or CLI commands are needed. The review follows the
[catalog order](skills/coherent/reference/taxonomy.md), while actual fixes
respect their dependencies. You can move on with issues still open.

Progress stays in the conversation. Repeating the bare invocation in that chat
starts the next offered review; a fresh chat starts at the beginning unless
you name a starting point. There are no progress files or generated audit
artifacts. An audit does not edit application code; a direct fix request
authorizes the requested improvement without an extra approval round.

You can also go directly to a specific task:

```text
$coherent simplify the duplicated order response contracts
/coherent review this worker's recovery and duplicate-write safeguards
$coherent review order loading for unnecessary fetches, derivable values and N+1 queries
$coherent review the whole platform for unnecessary workflows and capabilities
```

The default needs no CLI, baseline, persistent review, DAG or `.coherent/` directory.
It uses existing project guidance and preserves unrelated work. `init` is optional
when durable context is wanted; new context focuses on ownership, invariants and
intentional distinctions rather than counters that stale after every edit.

[Whole-system simplification](skills/coherent/reference/rules/F01.md) is also
independently selectable. Its six lenses rebuild from outcomes, remove work
created by the system, collapse handoffs, unify journeys, derive maintained
information, and challenge platform scope. The review distinguishes equivalent
redesigns from ideas requiring product or policy choices. Skip it or go directly
to any existing class or fix; it adds no prerequisites.

## Mechanical assistance when useful

```bash
coherent audit . --evidence --paths src/orders --rules A06 --json
```

Targeted evidence has no review states, planning fields or metadata writes.
Legacy `audit --json` output remains available unchanged for advanced consumers.
Use the actual runtime's `version` capability report before tool calls. Node.js
20+ runs the CLI; supported Python is needed only for in-scope Python analysis.
The unscoped npm name `coherent` is a different package: use the GitHub launcher.

The original `coherent install` project-adoption command still installs the CLI
with the detected package manager when dependency-managed tools are wanted.
Hooks, rules, aliases and other integrations remain explicit opt-ins. See
[installation](skills/coherent/reference/install.md).

## What Coherent looks for

Coherent focuses on the kinds of entropy that accumulate when a codebase is changed repeatedly by people and agents:

- dead code and stale compatibility paths
- whole workflows and capabilities a smaller complete design could eliminate
- duplicate implementations and representations
- terminology drift and implicit string protocols
- unnecessary layers, wrappers, helpers, and abstractions
- redundant fetches, values derivable from existing data, N+1 queries, unnecessary loading, and superseded requests
- unbounded work, repeated refreshes/rebuilds, and expensive individual query shapes
- fragile state, error-handling, test, dependency, and performance patterns

Some findings can be proven mechanically. Others require judgment about meaning, ownership, or intent. Coherent keeps that distinction visible: a valid result can be “these look similar, but they are intentionally different.”

Data-access review is built into the skill and can also be requested as a
focused pass. The existing E01 detector offers N+1 and repeated-query
candidates; derivable values and unnecessary loading require tracing callers,
data authority and freshness. See the
[data-access playbook](skills/coherent/reference/data-access.md).

## Optional advanced cleanup

Teams can explicitly choose persistent `review`, `baseline`, `check`, `inspect`,
`plan`, `fix next` and state-oriented `doctor` workflows. Existing commands,
version-1 stored schemas, package pins and configured hooks remain supported.
Their presence does not enroll ordinary work. See the
[advanced playbook](skills/coherent/reference/full-cleanup.md) and
[migration guide](skills/coherent/reference/migration.md).

`coherent migrate` previews optional conversion of legacy inventory context;
only `--write` changes managed context sections. Baselines and reviews are not
rewritten. Historical mechanical reviews need current source evidence before
suppressing changed findings. No migration is required for bounded work.

## Development

Use Node.js 20+ and pnpm. Run `pnpm validate` for lint, dependencies/security,
tests, typecheck, packed-package/build, generated docs and fingerprint checks.
