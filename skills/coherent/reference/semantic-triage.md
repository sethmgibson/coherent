# Semantic triage

Use this compact pass once during a full-repository audit. It covers blind
spots that mechanical findings cannot reliably identify. Load a full rule
playbook only when one of these probes produces evidence.

1. **Trace contracts end to end.** For important serialized or planned fields,
   follow producer -> parser -> consumer. Search every field name at once.
   Verify non-empty values affect behavior, and add a behavioral test using a
   meaningful value and a contrasting case that must not match. Confirm that
   aggregation preserves explicit risk and safety evidence; high confidence
   in a finding does not imply a low-risk fix. A declared prerequisite, unlock,
   policy, or status that no consumer reads is architecture fossilization.
2. **Prove analysis completeness.** Inspect catches around inventory, config,
   parsing, source ingestion, and dependency resolution. Empty/null fallbacks,
   log-only catches, and `catch { continue; }` must either surface an incomplete
   result or fail closed. A clean partial scan is not a clean repository.
3. **Find duplicate authorities.** For every durable file format and public
   domain object, locate all readers and validators. They must share one parser
   with one validation contract. Then search catalog IDs, schema versions, and
   product versions for independently maintained literal copies.
4. **Check transitional lifecycles.** Every live compatibility path needs a
   named consumer and an enforceable expiry or removal milestone. Verify that
   decision application, doctor, and pruning all reopen expired reviews; a
   comment alone is not enforcement.
5. **Evaluate scale at the target boundary.** Performance detectors operate on
   the target repository, not Coherent's own source size. For pairwise scans or
   repeated linear membership checks, identify the actual input bound and use
   indexed membership where it stays simpler. Defer when target-sized evidence
   is missing; do not dismiss from a small self-run alone.
6. **Exercise boundary combinations.** For machine-readable commands, parse
   stdout with supported option combinations, including explicit file output.
   For scoped analysis, compare representative findings against a full scan;
   check target-relative paths, renames, aliases, and transitive callers when
   those boundaries exist. A successful exit alone does not prove complete or
   consumable output.

Record only evidence-backed conclusions. Add a semantic finding when no
mechanical finding exists; a successful probe may also conclude that one
authority is already enforced or that two similar concepts are intentionally
different.
