# Full cleanup run

Use this playbook when the user asks to clean a whole repository, run the full
Coherent workflow, or continue until no safe cleanup remains. This is not the
default for ordinary feature work.

## Prepare

1. Read `.coherent/ARCHITECTURE.md`; run `coherent init` only when it is absent.
2. Run `coherent doctor`, then `coherent inspect`. Use `inspect --json` when
   complete finding evidence is needed for review.
3. Apply the compact [semantic triage](semantic-triage.md) once. A zero-node
   mechanical plan does not prove that rules without detectors are clean.
4. Create a baseline only when it is missing, stale, or the user intentionally
   wants to reset the comparison point. An equivalent baseline is left
   byte-for-byte unchanged.

When dogfooding the Coherent repository itself, its package binary is not a
workspace dependency. Before build use `pnpm exec tsx src/cli.ts <command>`;
after build use `node dist/cli.js <command>`.

## Review and fix loop

1. Treat the audit portion of `inspect` as raw mechanical signal. Its reviewed
   cleanup DAG is the action queue.
2. Inspect candidates by finding group and actual workflow. Do not bulk-dismiss
   heterogeneous findings merely to reach zero nodes; defer when evidence is
   incomplete.
3. `review apply` accepts either `fingerprint` or `fingerprints` on each batch
   item so one evidence-backed conclusion can cover a genuine finding group.
4. Perform only the next node from `inspect`, then typecheck, run targeted
   tests, `coherent check`, and `coherent inspect` again.
5. Repeat while a ready node exists. A plan with zero nodes is clean even when
   raw audit signals remain after reviewed dismissals. `fix next` exits
   successfully for that terminal state; it fails only when nodes remain but
   are blocked or need review.

Reviews for findings proven by the baseline but absent from the current audit
are resolved history, not doctor errors. Keep them so a recurrence remains
reviewed. A review absent from both current findings and the current baseline
is still an orphan that needs investigation. After a detector-revision change,
use `coherent review prune` to preview obsolete records and
`coherent review prune --write` only after the preview is correct.

## Finish

Run `coherent refresh` when discovered architecture facts changed, then:

```bash
coherent check --changed
coherent check
coherent doctor --deep
```

Run the repository's normal tests, typecheck, and build. Coherent's own
repository can run the complete validation set with `pnpm validate` (tests,
typecheck, build, skill-doc consistency, and fingerprint uniqueness).

Do not run `install` or `update` during cleanup unless the user explicitly
selected an optional Cursor or Git integration.
