# Cleanup planning

The cleanup DAG is authoritative. Default phases guide prioritization when dependencies are otherwise equal. Taxonomy IDs are not an execution schedule.

Run:

```bash
coherent plan
coherent plan --json
coherent plan --output path/to/plan.json
```

The CLI rebuilds the DAG from a fresh audit and prints ready vs blocked nodes. It writes nothing by default and does not execute the plan. `--output` is an explicit export, not required workflow state.

## What every node contains

- Findings addressed
- Prerequisite nodes
- Default phase
- Reason for ordering
- Concepts affected
- Likely files
- Confidence
- Behavioral risk
- Expected simplification
- Deletion potential
- What downstream work it unlocks
- Existing test and safety evidence

## Priority (in this order)

1. Prerequisite readiness
2. High confidence
3. Reduction of repository surface
4. Downstream unlock value
5. Simplification benefit
6. Behavioral risk
7. Test coverage
8. Default cleanup phase

A high-confidence A08 deletion can outrank a higher-severity semantic issue when removing it reduces the area that must later be reasoned about.

## Prefer early / be cautious early

Prefer early: unreachable code, verified obsolete compatibility, superseded implementations, collapsed representations after semantic equivalence is confirmed.

Be cautious early about: huge renames, rewriting boundaries before obsolete layers are removed, optimizing code likely to disappear, rewriting tests around architecture likely to change.

## Re-scan edges

These are explicit, not a workflow engine. After a node lands, re-run `coherent audit` and `coherent plan`.

- A07 removed → rerun A08
- A04 consolidated → rerun A08; reconsider B04, B05, D04, D05
- A06 collapsed → rerun A08; reconsider mapping helpers and serialization
- B01–B05 collapsed → rerun A08; reconsider D01 and performance findings

The catalog field `rescanAfter` is the source of these edges.

## Why a DAG beats a rigid list

Fixing one issue can resolve another indirectly or unlock a new cleanup. A rigid A01→A08 list would delay cheap surface reduction and would miss newly dead code after consolidations. The DAG encodes actual prerequisites; phases are only the default when those are equal.
