---
name: coherent
description: "Make worthwhile, bounded maintainability improvements to backend and large AI-built codebases. The agent interprets architecture and evidence, chooses and groups work, validates results, and explains the benefit. Precise mechanical tools and persistent cleanup management are optional. Not for frontend visual design."
---

Coherent is a skill-led maintainability workflow. The agent owns interpretation,
work selection, grouping, and validation. Mechanical tools supply evidence;
a signal is an investigation opportunity, not a bookkeeping obligation.

Use `$coherent` in Codex or `/coherent` in Cursor. Work through this canonical
skill; editor adapters are discovery, not another methodology.

## Default: one bounded improvement

1. **Understand scope.** Resolve the requested outcome, affected workflow,
   existing edits and constraints. Carry constraints forward. Advice and review
   requests authorize advice and review, not application edits or release.
2. **Inspect relevant architecture.** Read existing project instructions and
   the ownership, contracts and invariants involved. Use existing documentation.
   A missing `.coherent/ARCHITECTURE.md` does not block work or require `init`.
3. **Gather targeted evidence.** Search source, inspect callers and tests, and
   use compiler information or selected scanners when they save investigation.
   Load [audit.md](reference/audit.md) only when using mechanical tools. Verify
   the actual tool's capabilities; do not guess output shapes or mix runtimes.
4. **Complete a coherent improvement.** Choose work with a concrete benefit.
   Group related edits when they share contracts or validation; preserve distinct
   concepts. Explain a marginal cleanup's payoff before expensive validation.
   Evidence-backed agent judgment is sufficient: no saved review is required.
5. **Validate proportionately.** Follow [fix-safety.md](reference/fix-safety.md).
   Run focused checks while editing, then the broader repository-required checks.
   Additional passes need a change, failure or unresolved risk to justify them.
6. **Explain the benefit and stop.** Lead with before → after → practical effect,
   then preserved invariants, checks and limits. Distinguish runtime correctness,
   diagnostics, type guarantees and small simplifications. Do not turn every
   remaining signal into another task or claim whole-repository cleanliness.

A valid result may be that two similar concepts must stay distinct, or that
missing evidence prevents a safe change. Report the concrete reason and stop.
Never ask the user to route the next CLI command or memorize rule IDs.

## Safety and judgment

Before adding a service, helper, model or dependency, search for an existing
owner or authoritative representation. Before adding a boolean or fallback,
identify the actual state model or violated invariant. After consolidation,
look for the code it made obsolete.

Do not merge contracts from shape alone. Trace producer → parser → consumer,
including optionality, nullability, unknown values and external consumers.
Do not delete code from absent static references alone: inspect framework/CLI
registration, DI, decorators, reflection, dynamic imports, jobs and public APIs.

Compatibility needs a real consumer, purpose and removal condition. Preserve
uncertain outcomes and authoritative read-back. Changes involving external
writes must address idempotency, attempts, recovery, re-entry and duplicate
writes. A passed scanner is not evidence that a financial workflow is safe.

Keep deterministic conclusions mechanical; semantic and hybrid observations
need agent or human interpretation. No hosted agent service or generic plugin
infrastructure is needed.

## Context and write boundaries

Use chat and command output for the current task. Do not create reports, queues,
plans, scratch scripts or session ledgers merely so Coherent can operate.
Default work requires **zero Coherent metadata writes**, even when legacy
baseline/decision files exist. Do not parse or repair advanced state incidentally.

When the user requests durable context, follow
[architecture-analysis.md](reference/architecture-analysis.md). Keep ownership,
invariants, authoritative representations and intentional distinctions; avoid
volatile inventories, counts and completed-finding narratives. Update authored
context only when the task changes that knowledge. Never overwrite authored
content or create another architecture document when existing guidance suffices.

## Optional tools and advanced workflow

The CLI is optional. Skill-only adoption does not require a project dependency;
see [install.md](reference/install.md). No command writes metadata unless an
explicit output, initialization, migration, review or integration action requests it.

- `audit --evidence` supplies targeted source observations without reviews,
  baselines, priorities or a cleanup DAG. See [audit.md](reference/audit.md).
- `init` explicitly creates focused architecture context; `refresh` preserves
  existing authored context. See [init.md](reference/init.md).
- `version` identifies the actual runtime; see [runtime.md](reference/runtime.md).
- `migrate` previews optional state/context migration; see
  [migration.md](reference/migration.md). It does not enroll a project in cleanup.

Only an explicit request for persistent reviews, baseline drift/CI gates or
managed dependency-ordered cleanup selects the **advanced workflow**. Existing
configured hooks and direct CLI commands remain advanced opt-ins. The presence
of stored files alone is not consent to run it. Read
[full-cleanup.md](reference/full-cleanup.md) for `inspect`, `review`, `baseline`,
`plan`, `fix next`, `check` and state-oriented `doctor`. Their legacy command
meanings and stored state remain supported. Do not run them in an ordinary task.

## Routing

- **No concrete request:** offer a bounded inspection of the relevant area;
  clarify only scope that cannot reasonably be inferred. Do not auto-initialize.
- **Improve/fix a target:** follow the default six steps and stop after the outcome.
- **Audit/review:** investigate within scope and report evidence; do not edit
  application code unless requested. Repository-wide review does not require
  comprehensive candidate disposition or a baseline.
- **Ordinary feature work:** follow [prevention.md](reference/prevention.md).
- **Explicit advanced command or persistent cleanup:** load its reference and
  preserve its existing state/validation contract.
- **Taxonomy:** consult [taxonomy.md](reference/taxonomy.md) only as needed.

If parallel investigation is authorized, assign independent ownership and
preserve others' edits. Investigators return evidence and proposals. One
coordinator reconciles changes and validation. Only advanced work persists
review proposals through one atomic writer; ordinary work needs no review file.
