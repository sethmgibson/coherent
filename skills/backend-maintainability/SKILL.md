---
name: backend-maintainability
description: "Use when the user wants maintainability work on a backend or large AI-built codebase: initialize architecture context, audit entropy, plan cleanup, fix the next DAG node, check new drift, or record a baseline. Covers dead code, duplicate implementations, terminology drift, accidental architecture, and related problems. Not for frontend visual design."
---

Coherent is maintainability tooling for backend and large AI-built codebases. Architectural entropy from repeated agent feature additions is the main problem.

This skill is provider-neutral. The coding agent does semantic reasoning from repository context, deterministic findings, these instructions, and targeted inspection. There is no hosted LLM service.

Work through one skill. Do not invent extra skills or a parallel methodology.

## Three distinct concepts

1. **Taxonomy** — stable rule IDs (`A01`–`E06`). Names for problems, not a cleanup sequence. See [reference/taxonomy.md](reference/taxonomy.md). Source of truth: `src/catalog/rules.ts`.
2. **Default cleanup phases** — prioritization when dependencies are otherwise equal. See [reference/cleanup-phases.md](reference/cleanup-phases.md).
3. **Finding-specific cleanup DAG** — authoritative for actual work. Built by `coherent plan`. See [reference/cleanup-planning.md](reference/cleanup-planning.md).

Do not treat the 30 rule IDs as a rigid cleanup order. `A01` is not cleaned before `A08` merely because the number is smaller. A high-confidence dead-code deletion can outrank a higher-severity semantic issue when it shrinks the surface that must later be reasoned about.

## Setup

1. If `.backend/ARCHITECTURE.md` exists, read it before changing structure.
2. Load only the playbook that owns this request. The Commands table is the index.
3. Prefer `coherent <command>` (or the `backend` bin alias) for mechanical work.

## Before adding anything

Before adding a service or abstraction: search for an existing authoritative concept.
Before adding a DTO, model, or type: check whether an existing representation already expresses the required semantics.
Before adding a helper: search for equivalent behavior.
Before adding a dependency: inspect native capabilities and existing dependencies.
Before adding a boolean: ask whether it extends an existing state or policy model.
Before adding fallback behavior: ask which violated invariant makes the fallback necessary.
Before adding compatibility: document the actual consumer, the reason, and the removal condition.
Before adding another architectural layer: explain the responsibility that cannot belong in an existing layer.
After implementing: search for code the new implementation made obsolete.

Never preserve architecture simply because many files already use it.
Never consolidate two concepts solely because they have similar shapes.
A successful audit result may be: "Superficially similar but intentionally different; do not merge."

## Commands

| Command | What it does | Reference |
|---|---|---|
| `init` | Inventory the repo and write durable `.backend/ARCHITECTURE.md` | [reference/init.md](reference/init.md), [reference/architecture-analysis.md](reference/architecture-analysis.md) |
| `audit` | Deterministic scan plus agent semantic investigation | [reference/audit.md](reference/audit.md), [reference/semantic-audits.md](reference/semantic-audits.md) |
| `baseline` | Snapshot current findings to `.backend/baseline.json` | [reference/baseline.md](reference/baseline.md) |
| `plan` | Build the cleanup DAG from findings | [reference/cleanup-planning.md](reference/cleanup-planning.md), [reference/plan.md](reference/plan.md) |
| `fix next` | Select and perform one unlocked cleanup node | [reference/fix-safety.md](reference/fix-safety.md), [reference/fix.md](reference/fix.md) |
| `check` | Compare a fresh audit to the baseline; inspect new debt | [reference/check.md](reference/check.md), [reference/prevention.md](reference/prevention.md) |

Routing:

- **No argument:** recommend `init` if `.backend/ARCHITECTURE.md` is missing; otherwise recommend `audit`.
- **Explicit command:** load that reference and follow it.
- **Taxonomy questions:** load [reference/taxonomy.md](reference/taxonomy.md).
- **Ordinary feature work:** load [reference/prevention.md](reference/prevention.md). Do not run a full legacy cleanup for a small feature.

The CLI binary is `coherent`. `backend` is an alias for the same binary.

## Principles

- Deterministic analysis may conclude only from mechanical evidence. Semantic questions stay semantic. Hybrid rules may gather signals but still need judgment.
- Do not delete code merely because static references are absent. Stay conservative around DI, decorators, reflection, CLI and framework registration, dynamic imports, background jobs, public APIs, and package exports.
- Do not add generic infrastructure, plugin systems, or forwarding layers while cleaning a repository — including this one.
- Legacy adoption must work: existing debt is allowed, new debt is surfaced, resolved debt is tracked. A repository with a thousand old findings must remain usable on day one.
