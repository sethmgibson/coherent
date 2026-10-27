---
name: coherent
description: "Find and fix maintainability problems in backend and large AI-built codebases. General cleanup opens with whole-system simplification: question unnecessary workflows and capabilities before their implementation. Also accepts focused audits and fixes. Keep review conversational. Not for frontend visual design."
---

Coherent is a conversational maintainability skill. The agent investigates,
explains the issues, implements requested fixes, and helps the user choose what
to examine next. Mechanical tools are optional evidence, not a work queue.

Use `$coherent` in Codex or `/coherent` in Cursor, or a plain "coherent" request
when this skill is available. These are chat invocations; the CLI is optional.
Editor adapters lead here, not to another methodology.

## Default: inspect, offer fixes, suggest the next class

1. **Start investigating.** On a fresh, bare invocation or general cleanup
   request, begin with [whole-system simplification (F01)](reference/rules/F01.md):
   reconstruct the smallest complete system that delivers the intended outcomes
   and look for entire workflows or capabilities it makes unnecessary. Read
   project guidance, inspect existing edits, and trace representative entrypoints and callers.
   Infer outcomes and workflows from the codebase first; do not require the user
   to describe the application. Ask only targeted questions about unresolved
   business requirements that could change the proposal after inspecting available context.
   Infer a useful scope from the repository; do not ask the user to choose a CLI
   command or approve inspection. Existing architecture documentation helps;
   missing `.coherent/ARCHITECTURE.md` does not require `init`.
2. **Examine one problem class.** Read its playbook under
   [rules/](reference/rules/README.md), using source, callers, tests and relevant
   history to establish meaning and authority. Use the table order in
   [taxonomy.md](reference/taxonomy.md) for the review sequence: whole-system
   simplification, then architecture, terminology, and implicit protocols. Load
   only the current playbook and relevant supporting guidance. Review order is not mandatory fix
   order; prerequisites may make a proposed edit premature.
3. **Present concrete findings before editing.** Follow
   [semantic-audits.md](reference/semantic-audits.md). Prioritize worthwhile
   candidates, distinguish proven issues from open questions, and explain what
   could safely change. For F01, distinguish unnecessary behavior, equivalent
   redesigns, and ideas requiring product or policy decisions. Explain what
   disappears and which outcomes remain. For A01, identify authoritative patterns
   and patterns to stop propagating; for A02, explain the vocabulary before renaming anything.
   A bare invocation or audit does not authorize application edits. After the
   findings, ask whether to fix them, investigate more of this class, or move to
   the next named class. Do not require every candidate to be resolved.
4. **Complete the requested fix.** When the user asks to fix an issue, implement
   it without asking again. Preserve existing constraints and unrelated edits.
   Group related changes when they share contracts or validation; do not turn
   approval of one fix into permission to fix every class. Follow
   [fix-safety.md](reference/fix-safety.md), run focused and repository-required
   checks, and inspect code made obsolete by the change.
5. **Offer a natural continuation.** Explain before → after → practical effect,
   validation and remaining uncertainty. After each completed fix or fix round,
   offer to continue this class or review the next named class, even if more
   findings remain. For example: "We can keep working on these architecture
   issues, or move on to terminology drift." Suggesting a review does not start
   another fix. Complete the requested work and let the user choose.

Use the conversation to remember the current class, findings, choices and
intentional distinctions. A repeated bare invocation, "next" or "move on"
starts a read-only review of the next class offered; it never implies fix
approval. Honor explicit choices to stay, skip, revisit, stop, or fix. If the user
has already authorized a sequence of work, continue within that scope. In a fresh chat with
no usable history, start at F01 unless the user names a class or starting point;
do not invent previous coverage or reconstruct a tracking system.

Whole-system simplification is also independently selectable. It is an opening
review, not a required gate for existing classes. Keep the initial pass bounded;
deepen a promising proposal through conversation. Users can skip it, move on to
architecture fossilization, or request another class without resolving it.

No findings, intentional differences, and insufficient evidence are valid
outcomes. State what was examined and offer the next class; do not manufacture
cleanup or claim repository-wide cleanliness. At the end of the sequence,
summarize the reviewed scope and open questions without silently restarting.

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

Keep progression and findings in the conversation. Do not create reports, queues,
plans, scratch scripts, progress files or session ledgers merely so Coherent can
operate.
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

Only an explicit request for persistent reviews or baseline drift/CI gates
selects those optional tools. Existing configured hooks remain explicit opt-ins;
stored files alone are not consent. Read
[full-cleanup.md](reference/full-cleanup.md) for `review`, `baseline`, `check`
and state-oriented `doctor`. Their stored-state and validation contracts remain
supported. The coding agent owns cleanup sequencing in every workflow.

`plan`, `fix next`, and `inspect` are retired and return non-zero retirement
errors. Do not invoke them, construct a replacement Coherent metadata queue,
or translate their legacy catalog metadata into mandatory execution gates.

## Routing

- **Bare invocation, general cleanup, or continuation:** follow the conversational
  review above; continue existing chat progress instead of restarting.
- **Whole-system, business-logic, or full-platform simplification:** use
  [F01](reference/rules/F01.md) directly, at the requested scope. Phrases such as
  "$coherent simplify the whole platform" select this review in chat, not a new
  CLI command. No earlier class or persistent state is required.
- **Improve/fix a target:** go directly to the requested improvement and
  validation; do not restart at F01 or require an extra approval round. Offer
  a relevant next class after completing the requested work.
- **Audit/review a target or the whole repository:** honor that scope; do not
  restrict an explicit broad audit to one class. Report evidence and offer
  concrete fixes without application edits, saved reviews or a baseline.
- **Data fetching, N+1 or unnecessary loading:** use
  [data-access.md](reference/data-access.md) within the requested scope. This is
  part of normal source review and can also be requested as a focused pass;
  no separate CLI command or persistent state is required. Include derivable
  reads, N+1, unnecessary loading, superseded requests, workload bounds,
  repeated refreshes/rebuilds and expensive query shapes when relevant.
- **Ordinary feature work:** follow [prevention.md](reference/prevention.md).
- **Explicit persistent review or CI command:** load its reference and
  preserve its existing state/validation contract.
- **Taxonomy:** consult [taxonomy.md](reference/taxonomy.md) only as needed.

If parallel investigation is authorized, assign independent ownership and
preserve others' edits. Investigators return evidence and proposals. One
coordinator reconciles changes and validation. Only advanced work persists
review proposals through one atomic writer; ordinary work needs no review file.
