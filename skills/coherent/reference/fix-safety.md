# Fix safety

`coherent fix next` selects **one** unlocked cleanup node. It does not rewrite the repository. The agent performs the edit.

```bash
coherent fix next
coherent fix next --json
```

## Selection

The CLI picks the highest-scoring ready node: prerequisites satisfied, then confidence, surface reduction, unlock value, simplification, risk, tests, and default phase. Early in a legacy repository this is often high-confidence dead code or a stale path.

If the node is analysis-only, the successful outcome may be an architecture note rather than a code edit.

## Before editing

Inspect callers, callees, registration mechanisms, external and public reachability, tests, and relevant architecture documentation.

For dead-code deletion, verify dynamic mechanisms: DI, decorators, reflection, framework registration, jobs, CLI registration, dynamic imports, package exports, external API exposure.

## During editing

Prefer deletion, consolidation, reducing representations, removing wrappers, and moving invariants upstream.

Avoid replacement abstractions, compatibility wrappers for removed compatibility wrappers, and broad unrelated cleanup.

Only remove dead code when confidence is sufficient. Stale compatibility requires semantic verification before deletion.

## After editing

1. Typecheck
2. Run targeted tests
3. Run broader tests where appropriate
4. Rerun `coherent audit`
5. Rerun `coherent check`
6. Confirm the target finding is gone
7. Inspect newly dead code
8. Inspect newly unused dependencies
9. Update the cleanup DAG (`coherent plan`)
10. Update architecture documentation if authoritative concepts changed

After compatibility removal or consolidation, explicitly search for newly dead code, types, tests, helpers, configuration, and dependencies.

## Report

Lines added and deleted, symbols removed, representations removed, paths removed, findings resolved, findings indirectly resolved, new findings, newly unlocked cleanup nodes, tests run.

## Tests: early vs late

Early: small safety and characterization tests so cleanup cannot silently break behavior.
Late: architectural test simplification (D04, D05). Do not refactor hundreds of mocks around code that is likely to disappear.
