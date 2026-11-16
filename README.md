# Coherent

[![CI](https://github.com/sethmgibson/coherent/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/sethmgibson/coherent/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/@aevumvector/coherent.svg)](https://www.npmjs.com/package/@aevumvector/coherent)
[![Node.js 20+](https://img.shields.io/badge/node-%3E%3D20-339933.svg)](package.json)

**Find and fix the architectural entropy that AI agents leave behind in large
codebases.** Coherent is an agent skill for Codex and Cursor, plus an optional
TypeScript and Python CLI, for maintainability reviews of backend and large
AI-built codebases.

## Why Coherent exists

Coding agents are good at adding features and bad at noticing what each
addition costs. After enough sessions, a codebase collects a second way to load
an order, a third name for a customer, a wrapper around a wrapper, a
compatibility path nobody calls, and a boolean that should have been a state
machine. Every change passed review, and the system as a whole still got harder
to change.

Linters can't see this, because most of it is about meaning: are these two
types the same concept, or intentionally different? Is this fallback protecting
a real consumer? Coherent gives your agent a catalog of 31 problem classes, an
investigation playbook for each, and mechanical evidence where it can be proven.
It keeps the line between proof and judgment visible. "These look similar, but
they are intentionally different" counts as a valid result.

## Quick start

Install the skill into your project. No project dependency, baseline, or
config file is required:

```bash
npx --yes --package github:sethmgibson/coherent -- coherent install --skills-only --yes
```

Reload Codex or Cursor, then start a review in chat:

```text
$coherent        # Codex
/coherent        # Cursor
```

The agent opens with a whole-system simplification pass: what is the smallest
complete system that could deliver the same outcomes? It reports concrete
proposals without editing anything, then asks whether to fix them, dig deeper,
or move on to the next problem class. Reply in plain language ("fix the first
one", "keep looking", "next"). You don't need rule IDs or CLI commands.

> **Package name:** the unscoped npm package `coherent` belongs to someone else.
> Use the GitHub launcher above. An npm release is planned under
> `@aevumvector/coherent`; until it is published, the GitHub launcher is the
> supported install path.

## Usage examples

Point the skill at a specific problem:

```text
$coherent simplify the duplicated order response contracts
/coherent review this worker's recovery and duplicate-write safeguards
$coherent review order loading for unnecessary fetches, derivable values and N+1 queries
$coherent review the whole platform for unnecessary workflows and capabilities
```

Collect mechanical evidence for a path, or run a full scan, with the CLI:

```bash
# Targeted source evidence: no stored state, no review bookkeeping
coherent audit . --evidence --paths src/orders --rules A06 A08 --json

# Full scan grouped by category, with confirmed/candidate status per finding
coherent audit .

# Gate CI on new debt only (existing findings never fail the build)
coherent baseline .
coherent check . --changed
```

Example `coherent audit` output (excerpt, run against a test fixture):

```text
Coherent audit
Runtime: Coherent 0.2.0  workflow 3  detector 11  fingerprint 2  schema 1
Files: 27  Findings: 102 (9 confirmed, 93 candidates)

LEFTOVER STRUCTURE AND REPRESENTATIONS
  Duplicate representations: 0 confirmed, 3 candidates
    [candidate high hybrid] Structurally similar representations — src/types.ts PaymentData
      83% name overlap (5/6 properties); 5/5 type-compatible.
  Stale compatibility: 0 confirmed, 4 candidates
    [candidate medium hybrid] Likely compatibility path — src/compat.ts legacyLoadPayment
      Identifier 'legacyLoadPayment' matches a compatibility naming signal.
```

To use the CLI inside a project, the full project install adds it as a dev
dependency through your package manager and verifies the skill/CLI handshake:

```bash
npx --yes --package github:sethmgibson/coherent -- coherent install --yes
```

## What Coherent looks for

The catalog has six categories. The table order is the default review
sequence; the full catalog is in [taxonomy.md](skills/coherent/reference/taxonomy.md).

| Category | Examples |
|---|---|
| **F. Product and workflow simplification** | Whole workflows, pages, or subsystems a smaller complete design would eliminate |
| **A. Leftover structure and representations** | Architecture fossilization, terminology drift, implicit string protocols, duplicate implementations and representations, stale compatibility, dead code |
| **B. Accidental architecture** | Additive architecture, generic infrastructure, premature abstraction, excessive indirection, helper proliferation, layer violations |
| **C. Domain and control-flow design** | Downstream invariant patches, feature overfitting, boolean state explosion, context-object explosion, distributed workflow complexity |
| **D. Failure semantics, tests, and dependencies** | Dependency creep, defensive programming, swallowed errors, implementation-coupled tests, mock explosion |
| **E. Performance** | Redundant database access and N+1 queries, repeated computation, over-fetching, serialization overhead, unnecessary sequential I/O, algorithmic complexity |

Data-access review (derivable values, N+1, unnecessary loading, superseded
requests) has its own [playbook](skills/coherent/reference/data-access.md).

## How it works

**The skill is the product.** [`skills/coherent/SKILL.md`](skills/coherent/SKILL.md)
is a provider-neutral playbook. The agent reviews one problem class at a time,
reads the matching [rule playbook](skills/coherent/reference/rules/README.md),
traces callers, contracts, and tests, then presents findings before it edits
anything. Progress lives in the conversation, so there are no tracking files.
An audit never edits application code. Asking for a fix authorizes that fix
and nothing more.

**Every rule has a detection mode:**

- `deterministic`: provable from source alone (for example, unreachable code).
- `hybrid`: mechanical signals exist, but the conclusion needs judgment.
- `semantic`: requires judgment about meaning, ownership, or intent.

Deterministic conclusions stay mechanical. Hybrid findings remain *candidates*
until a person or agent confirms them with evidence.

**The CLI supplies evidence, not decisions.** 13 rules have mechanical
detectors (A03, A06, A07, A08, B03, B04, C03, C04, D01, D03, E01, E05, E06).
TypeScript (`.ts`, `.tsx`, `.mts`, `.cts`) is parsed once per scan with
[ts-morph](https://github.com/dsherret/ts-morph), respecting your
`tsconfig` path aliases and project references, plus bounded static NestJS
module and provider resolution. Python (A08, B04, C03, D03) is analyzed by a
standard-library `ast` sidecar that needs CPython 3.9+ and has no third-party
dependencies. The remaining rules are semantic and are investigated by the
agent; selecting them in `audit --evidence` is an error, not a silent pass.

**Write boundaries are strict.** Read-only commands write nothing.
Coherent-owned files appear only when you explicitly ask for them:
`.coherent/ARCHITECTURE.md` (`init`), `.coherent/baseline.json` (`baseline`),
`.coherent/decisions.json` (`review`), or a path passed to `--output`. The
installer never overwrites content outside Coherent-managed fences.

## CLI reference

Run `coherent <command> --help` for every flag. Every command takes an optional
`[root]` argument that defaults to the current directory.

| Command | What it does |
|---|---|
| `install` | Copy the skill into `.agents/skills/coherent` (Codex) and/or `.cursor/skills/coherent` (Cursor). Project scope also installs the CLI as a dev dependency. Flags: `--skills-only`, `--providers codex,cursor`, `--scope project\|global`, `--yes`; opt-in `--adapter`, `--alias`, `--rule`, `--cursor-hook`, `--git-hook`. |
| `update` | Refresh installed skill and integration files. Does not update the CLI dependency. |
| `version` | Report runtime identity and capabilities. `--expect-workflow`, `--expect-detector`, and `--require-capability` fail closed when the skill and CLI disagree. |
| `audit` | Full scan (`--json`, `--compact-json`), or targeted evidence with `--evidence --paths <paths...> --rules <ids...>`. `--output <path>` writes JSON explicitly. |
| `init` | Write a focused `.coherent/ARCHITECTURE.md` starter. An existing file is left unchanged unless you pass `--force`. |
| `refresh` | Update machine-discovered fenced sections in an existing architecture file without touching authored prose. |
| `migrate` | Preview converting legacy inventory-style architecture context. Writes only with `--write`. |
| `baseline` | Snapshot current finding fingerprints to `.coherent/baseline.json`. An equivalent baseline stays byte-for-byte unchanged. |
| `check` | Compare a fresh audit to the baseline. Fails only on **new** confirmed high/critical deterministic findings. `--changed` scopes to the Git diff plus transitive importers. |
| `review queue\|confirm\|dismiss\|defer\|apply\|prune` | Optional persistent workflow. `queue` is a read-only listing. The other subcommands record evidence-bound decisions in `.coherent/decisions.json`, and `prune` writes only with `--write`. |
| `doctor` | Check stored state integrity. `--deep` runs a full audit; `--staged` and `--ref <ref>` validate exact Git snapshots. |

`plan`, `fix next`, and `inspect` are retired. They exit non-zero with a
`scheduler_retired` error, because sequencing work belongs to the coding agent.
`backend` is an alias for the `coherent` binary.

### Configuration

An optional `coherent.json` at the repository root:

```json
{
  "ignore": ["fixtures", "generated"],
  "python": "/usr/local/bin/python3.12"
}
```

- `ignore`: file or directory names (exact names, matched at any depth) to skip
  in addition to built-in skips such as `node_modules`, `dist`, and virtualenvs.
- `python`: interpreter for Python analysis. Defaults to `python3`, then
  `python`. The `COHERENT_PYTHON` environment variable works too.

### Optional: gate CI on new debt

After a project install, commit a baseline and add a check step:

```yaml
- run: npx coherent check .
```

Existing debt never fails the check. New hybrid and candidate findings are
reported but don't fail by default. See [check.md](skills/coherent/reference/check.md)
and the [persistent tools playbook](skills/coherent/reference/full-cleanup.md).

## FAQ

**Is this a linter?**
No. A linter flags local patterns with fixed rules. Most Coherent problem
classes, such as terminology drift, duplicate representations, and stale
compatibility, need judgment about meaning and ownership. Coherent gives an agent
the playbooks to make that judgment and keeps mechanical proof separate from it.

**Does it change my code?**
The CLI never edits application code. The skill edits code only after you ask
for a specific fix, and it presents findings first.

**Does it send my code anywhere?**
No. Coherent has no remote services or telemetry. The CLI runs locally. The
skill runs inside the agent you already use, under that agent's normal data
handling.

**Which languages are supported?**
Mechanical detectors cover TypeScript and Python. Conversational review is
driven by your agent reading source, so it isn't limited to those languages,
but evidence tooling is. Coherent is aimed at backend code, not frontend visual
design.

**Which agents work with it?**
The installer targets Codex (`$coherent`) and Cursor (`/coherent`). The skill
itself is plain markdown, so any agent that can follow a `SKILL.md` can use
[`skills/coherent/SKILL.md`](skills/coherent/SKILL.md).

**Will `coherent check` fail my build on existing problems?**
No. Only new confirmed high- or critical-severity deterministic findings fail.
Existing findings, candidates, and advisory performance heuristics are
reported without failing.

**Do I need to run `init` or keep a baseline?**
No. The default workflow needs no CLI, no `.coherent/` directory, and no stored
state. Baselines and persistent reviews are opt-in for teams that want CI gates.

**Why is the npm package not `coherent`?**
That name belongs to an unrelated package. Use `github:sethmgibson/coherent`
today. The planned npm name is `@aevumvector/coherent`.

## Documentation

- [Skill entry point](skills/coherent/SKILL.md): the canonical agent workflow
- [Rule catalog](skills/coherent/reference/taxonomy.md) and [rule playbooks](skills/coherent/reference/rules/README.md)
- [Installation](skills/coherent/reference/install.md) · [Targeted evidence and audit](skills/coherent/reference/audit.md) · [Runtime compatibility](skills/coherent/reference/runtime.md)
- [Baseline](skills/coherent/reference/baseline.md) · [Check](skills/coherent/reference/check.md) · [Persistent reviews and CI](skills/coherent/reference/full-cleanup.md)
- [Data access](skills/coherent/reference/data-access.md) · [Fix safety](skills/coherent/reference/fix-safety.md) · [Feature-work prevention](skills/coherent/reference/prevention.md)
- [Architecture of this repository](.coherent/ARCHITECTURE.md)

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md)
for setup, validation commands, and project invariants. This project follows a
[Code of Conduct](CODE_OF_CONDUCT.md). Report vulnerabilities as described in
[SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 Seth Gibson and Coherent contributors

---

<sub>Built by [Aevum Vector](https://aevumvector.com), which builds and runs custom financial automation for accounting firms.</sub>
