# Scale run

One real repository, 2026-08-28. Not a fixture. Generated Coherent state was removed from the target afterward.

## Target

`/Users/sethgibson/Repos/eps_fin_ops` (`eps-fin-ops`). Largest local TypeScript/JavaScript tree that is not this repo: pnpm workspace (`apps/*`, `packages/*`, `modules/*`), Nx, NestJS + Express + React, 47 `@eps/*` path aliases, 25 project references, 70 `tsconfig*.json` files.

Other local candidates: `arclinx` (~1,030 TS/JS files, ~98k TS/TSX lines, Nuxt, no path aliases); `acm-billing` is Python. Nothing larger or more alias-heavy was available locally.

Approximate size Coherent actually parsed (walk skip list; no `.d.ts`):

- 837 TypeScript source files, 204,614 lines
- Inventory walk: 6,328 files, 275,426 source lines (includes JS)
- One `package.json`. Workspace members have no package manifests, so `inventory.workspace.packages` is empty and inventory reports a single package.

## Timing and memory

CLI: `pnpm exec tsx src/cli.ts` from this checkout. `/usr/bin/time -l` on darwin.

| Command | Wall | User | Peak RSS |
|---|---|---|---|
| `audit` | 42.82s (`durationMs` 42,161) | 54.82s | 2.23 GiB (2,389,688,320 bytes) |
| `plan` (re-audits, then merge) | 44.96s | 56.34s | 2.31 GiB (2,481,750,016 bytes) |
| `fix next` (re-plans) | 43.0s | — | not re-measured |
| `init`, `review dismiss`, `doctor` | < 2s each | — | — |

No crash, OOM, or hang. `findReferencesAsNodes` finished inside the audit budget at this size. It is not free: A08 walks every function, class, method, and variable. Cost was practical here; accuracy was not (see path aliases).

`plan` and `fix next` each rebuild the ts-morph project. Three full scans in one session were fine on a laptop with headroom above 2.5 GiB; they would be the first thing to cache before a much larger tree.

## tsconfig / project references / path aliases

ts-morph does **not** load the target tsconfig. `createAnalysisContext` uses hardcoded `ES2022` / `Node16` options, `skipAddingFilesFromTsConfig: true`, and `skipFileDependencyResolution: true`, then `addSourceFileAtPath` for each walked `.ts`/`.tsx`/`.mts`/`.cts` file.

Inventory *lists* the 70 tsconfigs and the pnpm workspace patterns. Analysis does not use them. `@eps/*` (47 paths, 285 files with those imports) is invisible to reference finding.

Confirmed consequence: `canonicalId` is imported as `from "@eps/shared-types"` and still reported as an unused export.

## Findings

First audit: 1,517 findings (179 confirmed, 1,338 candidates). Fingerprints unique (1,517 / 1,517). Occurrence merge held (E06/E05/A08 sites collapsed; example: `loop-filter` on `runDeterministic` with `occurrences: 5`).

| Rule | Count | Confirmed | Candidate | Notes |
|---|---|---|---|---|
| A06 | 493 | 0 | 493 | Largest hotspot. Same type paired many times (`ReplayFixture` ×11). |
| A08 | 329 | 95 | 234 | See below. |
| E05 | 225 | 0 | 225 | 120 await-in-loop, 105 sequential awaits. Matches the known independence heuristic. |
| E06 | 97 | 0 | 97 | Nested `.find`/`.filter`/loops. Aggregation worked. |
| A03 | 96 | 0 | 96 | String discriminants, including spec fixtures. |
| B04 | 61 | 61 | 0 | Hybrid “confirmed” by the detector; still `needs_review` until `review confirm`. Controllers and one-line forwards. |
| A07 | 55 | 0 | 55 | `legacy*` names and deprecation comments. |
| C04 | 53 | 0 | 53 | Large options/context types. Some look real (`ObservabilityContext` 39 props). |
| C03 | 50 | 0 | 50 | Many `bool-combo` identities are property names (`length`, `amount`, `undefined`), not flags. |
| D03 | 25 | 21 | 4 | Cursor `JSON.parse` catches returning `undefined`; some worker fallbacks. |
| B03 | 24 | 0 | 24 | Single-implementation ports; several look intentional. |
| E01 | 7 | 0 | 7 | Includes spec wait-loops. |
| D01 | 2 | 2 | 0 | Unused-dep scan sees only the root `package.json` and unresolved `@eps` imports. |

### A08 false-positive hotspots

- **Unused-export candidates (234):** barrel and Nest surfaces. At least 7 named symbols are imported via `@eps/*` (`canonicalId`, `WorkerRuntimeModule`, `readResponseRequestId`, …). 54 sit in `*controller*` / `http/` files; 4 are `*Module` exports wired through aliases.
- **Confirmed unused internals (95):** 90 are in `*.spec.ts` (mock methods: `connect`, `from`, `where`, `jobNames`). 5 are CJS destructures reported as `{ Pool }` / `{ Client }` even when `new Pool(...)` is in the same file (`packages/database/src/client.ts`).
- **Unreachable:** 1.

Deterministic A08 still becomes `ready` and is what `fix next` selected (`reconciliation.spec.ts` mock helpers). That is consistent with the merge rules and a poor first cleanup target on this repo.

## Uniqueness, reviews, plan merge

Held at this size.

- Dismissed `8c9ae64f…` (`unused:…pg-connector.ts:{ Pool }`) stayed in mechanical `findings.json` and was absent from `plan.json`.
- Unreviewed hybrids were `needs_review` (1,099 nodes). All 140 `ready` nodes were A08.
- A synthetic A01 in `semantic-findings.json` appeared as one `needs_review` node (`A01:scale-probe:canonical-id`).
- Plan: 1,239 unique node ids, 1,516 mechanical fingerprints + 1 semantic = 1,517 on the DAG after dismiss, 391 edges, 0 blocked.
- `doctor`: no duplicate fingerprints, no orphan review, semantic file valid. Only issue: `missing-baseline` (baseline was not written on purpose).
- `fix next` selected an unlocked A08 node, not a hybrid.

## Leftover risks (for calibrate)

- Loading the real tsconfig / path aliases / project references is the highest-leverage accuracy fix; it is not required to finish a scan at this size.
- A08 should not treat spec mocks or CJS binding patterns as confirmed internals.
- A06 volume will dominate any uncalibrated dashboard.
- E05 and C03 look noisy in the way the existing notes already predict.
- Inventory under-counts workspace packages when members have no `package.json`.
- `plan` / `fix next` re-parse the whole tree; cache the analysis project before targeting multi-million-line repos.

## Calibration (2026-08-28)

`detectorRevision` and `fingerprintVersion` are 2. Path aliases stay unresolved: loading the real tsconfig / project references is a rewrite, not a small compilerOptions patch. Unused exports remain candidates.

| Rule | Decision | Why |
|---|---|---|
| A03 | Keep as-is (hybrid / needs review) | Spec-fixture noise drops because `isTestFile` now matches `*.spec.ts` / `*.test.ts`. Remaining string discriminants need judgment. |
| A06 | Tighten aggregation | Pair explosion. Overlapping types now emit one cluster finding. Two-type identity is unchanged (`duplicate-rep:A+B`). |
| A07 | Keep as-is (hybrid / needs review) | Name/comment signals; not a confirmed-cleanup target. |
| A08 | Tighten confirmation | Do not scan unused declarations in test/spec files. Do not confirm CJS `require()` destructures (`{ Pool }`). Other destructures are checked per binding, not as `{ Name }`. Alias-missed exports stay candidates. |
| B03 | Keep as-is (hybrid / needs review) | Single-implementation ports are often intentional. |
| B04 | Keep as-is (hybrid / needs review) | Detector may mark confirmed; `fix next` still waits for `review confirm`. |
| C03 | Tighten identity | `bool-combo` was collecting property names (`length`, `amount`, `undefined`). Only boolean-typed or flag-named identifiers count. |
| C04 | Keep as-is (hybrid / needs review) | Large options types; some look real. |
| D01 | Keep as-is | Inventory sees one root `package.json`; that is an inventory limit, not a detector bug. |
| D03 | Keep as-is | Swallow vs fallback already classified; remaining cases need review. |
| E01 | Keep as-is | Spec wait-loops drop with the test-file match. |
| E05 | Keep as-is (hybrid / needs review) | Independence-from-identifiers is a known heuristic. No new false-positive pattern that is cheap to exclude without gutting await-in-loop. |
| E06 | Keep as-is | Aggregation already held. |

## More detectors

No new detectors (A04, A05, B01, C01, or others). Calibration showed existing mechanical rules are already the noise source. Reviews and rule playbooks are the better next step; a cheap high-precision AST case did not appear.
