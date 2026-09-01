# Full cleanup run

Use this playbook when the user asks to clean a whole repository, run the full
Coherent workflow, or continue until no safe cleanup remains. This is not the
default for ordinary feature work.

## Prepare

1. Run the exact compatibility command in [runtime.md](runtime.md). Stop on a
   missing command, revision mismatch, missing capability, or unexpected
   package/lock revision. Do not continue with a newer skill and older CLI.
2. Read `.coherent/ARCHITECTURE.md`; run `coherent init` only when it is absent.
3. Run `coherent doctor`, then `coherent inspect`. Use `inspect --json` when
   complete finding evidence is needed for review.
4. Apply the compact [semantic triage](semantic-triage.md) once. A zero-node
   mechanical plan does not prove that rules without detectors are clean.
5. Create a baseline only when it is missing, stale, or the user intentionally
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
4. All candidates, including unused exports, require an evidence-backed
   `review confirm` before `fix next` can select them. Confirming a finding is
   an agent review decision, not a request for another user approval. When no
   node is ready, investigate the highest-value unreviewed group, confirm,
   dismiss, or defer it, and rebuild the plan. A full-cleanup request already
   authorizes this review loop; do not stop merely because ready is zero.
5. Perform only the next ready node, then typecheck, run targeted tests,
   `coherent check`, and `coherent inspect` again. Use evidence from the same
   inspection rather than rerunning audit, plan, and fix next for each view.
   Investigators return proposals only. One coordinator writes decisions and
   architecture notes, then verifies with `review queue` and `doctor`. Do not
   run concurrent `review apply` agents. Serialize review writes and code
   edits so decisions apply to the snapshot actually inspected. Do not delete
   many unrelated nodes in one batch.
6. Stop when the reviewed plan is empty, or every remaining group has a
   concrete deferral/blocker that cannot be resolved within the request. Do
   not repeatedly reconsider deferred groups without new evidence. Report
   ready, unreviewed, deferred, and blocked work separately. Zero ready nodes
   with outstanding reviews is not a clean repository. `fix next` exits
   successfully only for an empty plan or a selected ready node.

Mechanical findings disappear on rescan. Semantic-only findings do not:
after tests and source inspection prove one fixed, remove that exact entry
from the active `findings` array in `decisions.json`. Preserve unrelated
findings and reviews. Do not dismiss a real fixed issue as a false positive;
report its evidence and fix in the final response, then preview review pruning.

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

`check: NEW 0` reports drift against the baseline, not correct behavior or
completed semantic review. `doctor` verifies Coherent state, not application
health. Report which normal validation gates passed, failed, or were not run.

Before committing, stage the intended artifact and run `coherent doctor
--staged --deep`. After committing, run `coherent doctor --ref HEAD --deep` if
the commit includes Coherent decisions, a baseline, or a CLI dependency
change. A dirty-worktree doctor pass is not proof that the selected commit is
valid. Treat the CLI lock, detector-version baseline, and mechanical/hybrid
decisions as coupled state; do not split incompatible revisions across commits.

Do not run `install` or `update` during cleanup unless the user explicitly
selected an optional Cursor or Git integration.
