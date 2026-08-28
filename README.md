# Coherent

Impeccable-style maintainability tooling for backend and large AI-built codebases.

Repeated agent feature additions do not usually rewrite a design. They add a path, a helper, a flag, a compatibility shim, and another name for a concept that already existed. The repository still compiles. The architecture becomes a fossil of every prompt that landed.

Coherent’s job is to make that entropy visible and to clean it up in an order that does not make things worse. It is not a frontend design skill, a SaaS product, or a plugin platform. It is not a hosted LLM service. The coding agent itself performs semantic reasoning using repository context, deterministic findings, skill instructions, and targeted inspection.

## The problem

AI-built backends grow by accretion:

- A new module appears beside the one that should have changed.
- The same behavior is implemented twice because the first copy was hard to find.
- Terms drift until nobody can tell which type is authoritative.
- Dead compatibility and unused exports stay in the tree, so the next agent imitates them.
- Tests lock the accidental structure in place.

The result is architectural entropy: more representations of the same information, more forwarding layers, and more cleanup risk every week.

## Deterministic, semantic, and hybrid

Not every maintainability question can be answered by a scanner.

- **Deterministic** rules conclude only from mechanical evidence. Dead code is the main example, and even there Coherent stays conservative around reflection, dynamic imports, framework registration, and public APIs.
- **Semantic** rules need judgment about meaning, ownership, or intent. Architecture fossilization and premature abstraction are semantic. They must not be turned into fake lint failures.
- **Hybrid** rules can gather signals (duplicate files, flag counts, unused packages) but still need a person or an agent to decide what the signal means.

Never convert a semantic question into a fake deterministic conclusion. A successful audit result may be: “Superficially similar but intentionally different; do not merge.”

## Taxonomy is not cleanup order

Coherent has a 30-rule catalog with stable IDs (`A01`–`A08`, `B01`–`B06`, `C01`–`C05`, `D01`–`D05`, `E01`–`E06`). The IDs group related problems. They are not an execution schedule.

Three distinct concepts:

1. **Taxonomy** — stable names for problems
2. **Default cleanup phases** — tie-breakers when dependencies are otherwise equal
3. **Finding-specific cleanup DAG** — authoritative for actual work

The catalog lives in `src/catalog/rules.ts`. Skill references are generated from it.

| Band | What it names |
|---|---|
| A | Leftover structure and representations |
| B | Accidental architecture |
| C | Domain and control-flow design |
| D | Failure semantics, tests, and dependencies |
| E | Performance |

See `skills/backend-maintainability/reference/taxonomy.md` for the full list.

## Why the cleanup DAG beats a rigid list

A rigid A01→E06 list would delay cheap surface reduction and would miss work that appears only after something else is deleted. Findings have prerequisites. Fixing one issue can resolve another indirectly or unlock a new cleanup. `coherent plan` builds that graph. Default phases only break ties.

## Why dead code is early — and why it is re-scanned

Dead-code reduction (A08) happens early so later analysis has less surface to misunderstand. It is re-run after stale-compatibility removal, after canonicalization, and after architecture collapse because those edits leave newly unused code, types, tests, helpers, configuration, and dependencies.

Stale compatibility (A07) requires semantic verification before deletion. After it is removed, search again for newly dead paths.

## Why semantic mapping can happen before physical edits

A01, A02, and A03 often produce knowledge — intentional architecture, historical accidents, domain vocabulary, protocol and state vocabulary — before any rename or rewrite. Do not mass-rename solely because terminology drift was discovered. Rename when it supports an actual consolidation or clarification.

Audit order may study these rules early even when A08 cleanup happens first physically.

## Why tests have early safety work and later architecture cleanup

Early: understand existing behavioral tests and add small characterization tests so cleanup cannot silently break behavior.

Late: simplify implementation-coupled tests and mock pyramids (D04, D05). Do not rewrite hundreds of mocks around code that is likely to disappear.

## Why performance is last

E01–E06 only apply to architecture that survived. Optimizing a path that should be deleted is wasted work.

## Baseline adoption for huge existing repositories

Legacy adoption must work.

- Existing debt: allowed initially
- New debt: surfaced, and blocked when it is a new confirmed high/critical deterministic finding
- Resolved debt: tracked positively

`coherent baseline` snapshots current findings. `coherent check` compares a later audit to that snapshot. A repository with a thousand old findings must remain usable on day one.

## Commands

| Command | What it does |
|---|---|
| `coherent init` | Inventory the repo and write `.backend/ARCHITECTURE.md` |
| `coherent audit` | Run implemented detectors, group findings, write metrics |
| `coherent baseline` | Snapshot findings to `.backend/baseline.json` |
| `coherent plan` | Build the cleanup DAG from current findings |
| `coherent fix next` | Select one unlocked cleanup node and print a work brief |
| `coherent check` | Compare a fresh audit to the baseline; inspect new debt |

`backend` is an alias for the same CLI. In Cursor, the skill namespace is `/backend`. The canonical skill is `skills/backend-maintainability/`. `.cursor/skills/backend` is an adapter, not a second source of truth.

### Intended workflow

1. `/backend init` — inventory and durable architecture context. Complete semantic sections with facts, not guesses.
2. `/backend audit` — deterministic scan, then agent semantic investigation.
3. `/backend baseline` — snapshot current debt.
4. `/backend plan` — construct the DAG. Do not sort by rule ID.
5. `/backend fix next` — one bounded node. Re-audit, re-check, re-plan.
6. `/backend check` — after ordinary feature work, ask whether the change made the system conceptually harder to change.

Implemented detectors: A08, A07, A03, A06, B03, B04, C03, C04, D03, D01, E01, E05, E06. Other catalog rules need semantic analysis.

## Usage

```bash
pnpm install
pnpm build
coherent init
coherent audit
coherent baseline
coherent plan
coherent fix next
coherent check
```

Or from this checkout:

```bash
pnpm exec tsx src/cli.ts init
```

`init` writes discovered facts and leaves semantic sections explicitly incomplete. It will not overwrite an existing `ARCHITECTURE.md` unless you pass `--force`.

`.backend/ARCHITECTURE.md` is durable project context and should be committed. `.backend/baseline.json` should be committed. `.backend/inventory.json`, `findings.json`, `plan.json`, and `next.json` are regenerable and gitignored.

## Metrics

Individual metrics, each tagged MEASURED or SEMANTICALLY INFERRED. There is no single opaque score. Examples: confirmed dead-code findings, stale compatibility paths, competing implementations, representations per concept, forwarding wrappers, dependency overlap, swallowed errors, N+1 candidates, complexity risks, confirmed vs candidate totals.

## Development

```bash
pnpm test
pnpm typecheck
pnpm generate:skill-docs
```

Requires Node.js 20+ and pnpm.

## License

MIT
