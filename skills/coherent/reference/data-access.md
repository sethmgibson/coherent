# Data access and unnecessary loading

Use this playbook for data paths touched by ordinary work, or when the user
asks to review fetching, N+1 queries, over-fetching, or unnecessary loading.
Follow the canonical skill's scope and write boundaries. A review reports
findings; a requested improvement may implement them. No CLI, baseline or
saved review is required. Inspect the affected workflow, not every data path.

## Trace the work before choosing a fix

Follow trigger -> loader -> database/API -> transformation -> consumer.
Include composed services, serializers, ORM lazy relations and client loaders
when relevant. Establish what data is already available, which source owns it,
which consumers need it, and when it must be fresh. Check callers outside the
immediate function before narrowing a shared payload.

Investigate seven questions:

1. **Can existing inputs replace the read?** Look for a query or endpoint used
   only to retrieve a count, total, balance, boolean or status that authoritative
   inputs already determine. For example, billed cents minus paid cents may
   supply a balance if those inputs share the required scope and snapshot.
   Trace the actual formula and rounding; a similarly named aggregate may
   include different adjustments. Never treat unknown values as zero. A
   paginated, filtered or permission-limited list cannot establish a global
   count, total or absence. If inputs are not already available, compare the
   cost of a narrow server aggregate; fetching all rows just to calculate
   locally can make the work worse.
2. **Does I/O grow with item count?** Trace per-item repository/API calls in
   loops, async callbacks, serializers and lazy relations. Identify the initial
   list query and each item's dependent reads, including calls hidden behind
   helpers. Look for same-key reloads across composed services. Consider a
   bounded batch, projection, join or request-local reuse with the same
   semantics. `Promise.all` alone still issues N queries. Bound batch size and
   memory, respect provider limits, and preserve per-item errors, ordering and
   authorization. Keep reads that must observe intervening writes.
3. **Is the load needed now, or at all?** Compare fields and rows loaded with
   actual consumer use. Look for full collections used only for existence or
   totals, hidden tabs or closed dialogs that load detail eagerly, duplicate
   server/client requests, polling without a current consumer, and effects or
   invalidation that refetch unchanged inputs. Distinguish intentional prefetch
   and freshness from accidental work. Consider a narrower projection,
   server-side aggregate, demand-triggered load or correct invalidation. Check
   loading, error, empty and reopen behavior when changing the trigger.
4. **Has a newer request superseded this one?** Trace rapid search/filter
   changes, navigation, tenant switches and overlapping refreshes. Check that
   late successes, errors and finalizers cannot replace newer data or clear a
   newer request's loading state. Cancel obsolete reads where supported and
   guard result application by the current request and scope. Cancellation
   alone does not establish that server work stopped or that an external write
   did not happen; preserve mutation recovery and authoritative read-back.
5. **Is the amount of work bounded?** Look for unrestricted collection reads,
   client-controlled page sizes, growing in-memory buffers and per-item
   `Promise.all` fan-out. Trace limits through every page, retry and worker;
   a small page does not bound concurrency across all pages. Choose pagination,
   streaming, bounded batches or concurrency limits from actual input sizes,
   memory, connection pools and provider quotas. Preserve stable ordering,
   complete results, backpressure and resumability; silently truncating data
   is not a performance fix. Finite small inputs can legitimately need no
   additional machinery.
6. **Does each item trigger a full refresh or rebuild?** Trace bulk imports,
   job completion hooks, events and invalidation into summary recalculation,
   index/cache rebuilding and page refreshes. Identify when one correctly
   timed batch update or an update of the affected scope could replace full
   work per item. Inputs may change on every item; establish whether any
   consumer needs those intermediate states. Preserve visibility, transaction
   boundaries, idempotency and recovery after partial failure or a crash before
   finalization. Do not drop required intermediate audit or provider effects.
7. **Is an individual query doing excessive work?** Inspect filters, sort and
   pagination, correlated subqueries and joins that multiply rows. One query
   can scan, sort or return far more data than the result needs. Use the actual
   schema, existing indexes, representative parameters and query-plan evidence
   to support query/index recommendations. A sequential scan alone is not an
   issue; compare its cost at the relevant scale. For a join-based N+1 fix,
   verify row counts, duplicate handling and aggregate correctness as well as
   round trips. Use non-executing `EXPLAIN` or existing traces first; execution
   profiling such as `EXPLAIN ANALYZE` runs the statement and must stay within
   the task's authorized environment and side-effect boundaries.

## Preserve the data contract

Before removing, reusing, batching or deferring a read, establish:

- **Authority and completeness:** same tenant/user, filters, statuses, time
  window, timezone, pagination and source of truth; preserve signed values,
  units, precision, nulls and unknown states.
- **Freshness and ordering:** required snapshot/transaction semantics,
  read-after-write behavior, concurrent changes, and cache invalidation. Never
  replace authoritative read-back after an external write with predicted math.
  Superseded requests must not alter the current scope's data, errors or loading
  state. Deferring rebuilds needs a defined visibility and recovery contract.
- **Access and effects:** permission checks, tenant isolation, audit effects,
  rate limits and error/recovery behavior. A read may also validate access or
  synchronize state; do not remove those responsibilities incidentally. Keep
  request-local reuse within its authorization and snapshot boundaries.

Missing evidence leaves a candidate with a concrete question to resolve.
Do not add a cache, shared loader, materialized total or new abstraction before
checking whether removing the read or changing the query is enough.

## Mechanical assistance is optional

The existing E01 detector supplies TypeScript/JavaScript candidates for awaited
repository-style calls in loops and repeated textual lookups. It does not prove
N+1 cost, freshness equivalence or safe replacement with arithmetic. Inspect
async callbacks, lazy loading and indirect calls manually; no E03 detector
currently ships. Request lifecycle, workload bounds, rebuild timing and SQL
cost also require source/runtime investigation; the current detectors do not
establish them. A scan with no observations does not establish efficient
loading. See [audit.md](audit.md) for the runtime capability check, then:

```bash
coherent audit . --evidence --paths src/orders --rules E01 --json
```

Use E01 for redundant reads, derivable values and N+1; E03 for excess payloads,
unnecessary load triggers and superseded reads; E02 for repeated computation
and rebuilds; and E06 for costly query shapes or missing workload bounds. E05
covers independent I/O unnecessarily awaited in sequence, with bounded
concurrency as a fix constraint. Classify one cause under its best-fitting rule;
do not multiply findings for the same request/rebuild chain. See the existing
[E01](rules/E01.md), [E02](rules/E02.md), [E03](rules/E03.md),
[E05](rules/E05.md) and [E06](rules/E06.md) playbooks when needed.

## Evidence, validation and handoff

For each worthwhile finding, identify exact files/symbols, the trigger and
consumer, the current query/request pattern, inputs already available, the
proposed change, and the contract evidence that makes it safe. State the
expected reduction concretely, such as 1 + N queries -> 2 bounded queries or
one detail request deferred until the dialog opens. Label estimates and
distinguish query counts from measured latency or database work.

Validate observable output and meaningful controls: empty and non-empty data,
partial inputs, unknown/negative values where relevant, tenant scope,
intervening writes and error/recovery cases. For N+1 fixes, compare query or
request counts at multiple representative collection sizes with equivalent
outputs. For deferred loading, exercise both inactive and active consumers,
reopening and refresh after mutation. Use existing tracing or focused tests;
do not require production access or create a benchmarking framework.

For the additional checks, collect and validate:

- **Superseded requests:** force out-of-order successes and failures, change
  scope or navigate away, and verify that old completion/finalization cannot
  replace current data or loading/error state. Check abort handling separately
  from genuine failures and mutation outcomes.
- **Workload bounds:** use inputs above a page/batch boundary, record peak
  in-flight work and retained data, and exercise retries and partial failures.
  Verify complete results without duplicates, omissions or unbounded buffering.
- **Refreshes/rebuilds:** count rebuilds or invalidations across representative
  batch sizes, compare final outputs and required intermediate visibility, and
  exercise failure before finalization plus safe replay/resumption.
- **Individual queries:** compare plans and processed/returned rows with
  representative cardinalities and parameter values. Test joins with zero,
  one and multiple related rows so duplicates or changed totals cannot hide
  behind a lower query count. Separate estimated cost from measured execution.

Report confirmed issues separately from candidates and intentional reads.
Explain the practical benefit and remaining uncertainty; do not claim speedups
from source inspection alone. Report in chat unless durable output was
requested. Select rule IDs in `audit --evidence` when mechanical observations
help. Persist decisions only when durable reviews are explicitly requested.
The agent chooses which observations warrant further work.
