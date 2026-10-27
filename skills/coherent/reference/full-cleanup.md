# Persistent reviews and CI checks

Use this playbook only when the user explicitly requests durable reviews,
baseline drift gates, or a repository's configured CI checks. Ordinary reviews
and fixes follow the conversational skill. Existing state files alone do not
select this workflow.

The coding agent owns investigation, cleanup sequencing, and implementation.
`plan`, `fix next`, and `inspect` are retired. They return a non-zero retirement
error without scanning or writing state. There is no CLI cleanup queue to drain
and no scheduler terminal state to reach.

## Prepare only the tools needed

- Verify the actual runtime using [runtime.md](runtime.md) before persistent
  operations. Workflow revision 3 preserves detector and stored-state contracts
  while removing scheduling.
- Read existing architecture and project guidance. Use `init` only when durable
  context is requested or a selected doctor gate requires the document.
- Use `audit --json` for a full source snapshot, or targeted `audit --evidence`
  for bounded observations. `review queue --json` lists findings and recorded
  judgments when that history is relevant; it does not prescribe work order.
- Create a baseline only for explicitly selected CI adoption or an intentional
  comparison reset. An equivalent baseline stays byte-for-byte unchanged.

For Coherent's own repository, use `pnpm exec tsx src/cli.ts <command>` before
build or `node dist/cli.js <command>` afterward.

## Keep useful review history

Investigate the requested scope and choose worthwhile work using source,
callers, contracts and tests. Use [semantic-triage.md](semantic-triage.md) for
an explicitly comprehensive audit. The agent identifies real prerequisites;
legacy catalog phase and dependency fields do not schedule work.

When durable judgments are requested, use `review confirm|dismiss|defer` or
`review apply --input path/to/reviews.json`. Give each batch item its own
evidence-backed reason; a multi-fingerprint item must stay within one review
evidence group. Use `--dry-run` to preview exact targets and replacements.
Do not manufacture decisions to clear a listing.

Confirmation records a judgment, not permission to implement or a deterministic
proof. The legacy `ready` label in review/check JSON remains a review disposition,
not an executable task. Preserve candidate uncertainty and the distinction
between semantic judgment and mechanical evidence.

Keep evidence hashes, detector revisions, compatibility expiry or removal
milestones, ambiguity checks, and missing-evidence/reconsideration reasons.
Changed source assumptions or expired reviews require fresh investigation.
Never retry a write automatically after an uncertain result.

Stored semantic findings remain in `decisions.json`; fixed findings can be
removed from its active `findings` array only after validation and within the
requested persistent workflow. Preserve unrelated findings and reviews.
Baseline-backed resolved reviews remain history, not orphans. `review prune`
previews stale, expired or genuinely orphaned records; `--write` is explicit.
There is no automatic history reset or schema migration for scheduler retirement.

## Validate the selected change and configured gates

Follow [fix-safety.md](fix-safety.md), then run the repository's required tests,
typecheck and build. For configured prevention, use `check --changed` for scoped
feedback and full `check` for repository-wide conclusions. The gate fails only
for new confirmed high/critical deterministic findings; reviews annotate drift
without changing that failure policy.

Use `doctor` for stored-state integrity and `doctor --deep` when current-finding
validation warrants a full scan. `doctor --staged` checks the exact Git index;
`doctor --ref HEAD` checks the committed artifact. Preserve compatible CLI pins,
baselines and review revisions when changing those contracts. Gate success is
not proof of correct business behavior or a completed semantic review.

Do not run every command for every fix. Report the selected scope, before/after
behavior, validation, and remaining uncertainty. Continue only within the user's
authorized scope; review history does not choose the next task.
