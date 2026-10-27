# Semantic audits

Investigate source and explain conclusions in the conversation. No CLI,
initialization, saved decisions, report or tracking file is required. An audit
does not modify application code; requested fixes follow the canonical skill.

For a bare invocation, review one class at a time in the table order of
[taxonomy.md](taxonomy.md). A fresh general cleanup opens with
[F01 whole-system simplification](rules/F01.md), then A01 architecture
fossilization, A02 terminology drift, and A03 implicit protocols. F01 can also
be selected independently or skipped; it is not a prerequisite for other
classes. The remaining classes follow that same table. The table is the
sequence, not a checklist to persist.
Explicit focused or comprehensive audit requests override this default scope.

Audit order may differ from cleanup order. Establish vocabulary and ownership
before consolidating; dead-code deletion may be a prerequisite to repairing a
surviving layer. Do not require an earlier class to be exhausted before moving on.

## Investigate the current class

Read existing project guidance and the relevant [rule playbook](rules/README.md).
Trace callers, callees, data ownership, tests, database representations and
runtime behavior where relevant. Use history when it helps establish why a
transitional pattern persists. Do not assume a copied convention is correct
or similarly named concepts are equivalent.

Inspect representative workflows deeply enough to support specific conclusions;
state which paths were examined and which questions remain open. Do not read
every file or run every detector just to complete a class. If a targeted tool
helps, use [audit.md](audit.md); a scanner's silence does not clear semantic work.
For an explicit full-repository audit, also use
[semantic-triage.md](semantic-triage.md) to examine detector blind spots.

For reachability, name the actual caller, registration, port binding or external
consumer. A shared name, barrel export, allowlist or passing test suite does not
prove production use. Do not propose a new abstraction before explaining why
an existing owner cannot serve the purpose.

## Explain worthwhile findings

Prioritize concrete cleanup candidates and group related evidence. Each finding
should make these points clear without imposing a verbose form or JSON output:

- Severity (critical/high/medium/low), confidence, and confirmed vs candidate.
- Exact files/symbols and evidence that the issue exists.
- Whether the concepts are equivalent or only superficially similar.
- Which implementation or concept is authoritative, and why.
- What could safely be deleted, consolidated or redesigned.
- Prerequisites, expected simplification benefit and what the change unlocks.
- Change risk, relevant behavioral tests and missing safety evidence.

Rule IDs help internal navigation; use problem names when talking to the user.
For whole-system simplification, explain the smaller alternative, the causal
chain of what disappears, and preserved outcomes. Distinguish unnecessary
behavior, equivalent redesigns, and conditional product or policy ideas;
challenge the proposal with the strongest counterexample. For architecture
fossilization, explain the authoritative patterns and those
that should no longer be copied. For terminology, explain the dictionary before
proposing renames. Do not overwhelm the user with weak or repeated signals.

Intentional differences are a successful result: explain why the concepts must
stay distinct. When evidence is missing, name the question that prevents a safe
change. Keep these conclusions in chat unless durable context was requested.

End by offering to fix the concrete candidates, investigate more of this class,
or review the next named class. A completed fix should offer the same choice;
the next class does not require every remaining issue to be resolved. After
the final class, summarize scope and open questions rather than promising a
clean repository. Follow the user's choice and existing authorization.

## Advanced recording (explicit opt-in only)

The rest of this reference applies only to explicitly requested persistent
reviews or managed cleanup. It is not part of ordinary conversational review.
Use [full-cleanup.md](full-cleanup.md) for setup and runtime compatibility.

The CLI `Finding` object already has these fields. Required planner inputs (`severity`, `confidence`, `detectionMode`, `status`, `evidence`, `cleanupBenefit`, `changeRisk`, `prerequisiteFindingIds`) must be present; `coherent doctor` rejects the file if they are missing or the wrong shape. `detectionMode` must be `semantic` or `hybrid`. Leave optional judgment fields (`semanticEquivalence`, `authoritativeConcept`, `deletionOpportunity`, `unlocks`, `testSafetyEvidence`) absent rather than inventing certainty.

`prerequisiteFindingIds` contains current finding fingerprints that must be
cleaned first. The planner maps them to cleanup-node edges, ignores references
within the same grouped node, and treats fingerprints absent from the current
plan as already satisfied. `unlocks`, when present, is preserved in the cleanup
node and work brief.

Mechanical evidence is regenerated by `coherent audit` and stays in memory unless the user explicitly requests `--output`. Do not invent a second findings format or a persistent audit report.

- Durable state goes in `.coherent/decisions.json`: reviews in `reviews`, semantic-only findings in `findings`. Reviews written through `coherent review` are stamped with `fingerprintVersion`, the release-wide `detectorRevision`, and `ruleDetectorRevision`. Mechanical and hybrid reviews apply only when their rule revision is current, even when the fingerprint is exact; changes to another detector do not erase their history. Legacy records fall back to the release-wide revision. An exact pure-semantic review may survive a detector bump because no mechanical detector produced it. Identity fallback (`ruleId` + `identity`) also requires the current per-rule revision. Identity fallback is refused when more than one current finding shares that identity; review the exact fingerprint.
- A dismissed or deferred Stale compatibility review must carry either a future `expiresAt` ISO date/timestamp or a non-empty `removalMilestone`. Use `--expires-at` or `--removal-milestone` for one review; batch items use the matching JSON fields. A missing or expired lifecycle makes the review stale and reopens a current finding. If the A07 signal is not compatibility behavior, dismiss it with `--not-compatibility` (batch field `"notCompatibility": true`) instead of inventing a lifecycle. Compatibility metadata is not accepted for other rules.
- `coherent doctor` performs schema, version, duplicate, architecture, baseline, and compatibility-lifecycle checks without an audit. Use `coherent doctor --deep` when orphan and current-finding review validation justifies a full scan. Use `--staged` to export and validate the exact Git index, or `--ref <ref>` to export and validate a committed tree; neither mutates the target repository. Doctor also rejects baseline/decision detector-revision skew. Reviews whose exact fingerprints remain in the current baseline but not the current audit are resolved history, not orphans. Doctor reports stale, expired, or genuinely orphaned reviews; it does not delete them.
- `coherent review prune` previews stale, expired, and genuinely orphaned review records. Add `--write` only after inspecting the exact list. Current reviews and current-lifecycle baseline-backed resolved history are retained.
- Semantic-only entries use the same `Finding` shape. `detectionMode` must be `semantic` or `hybrid`. Do not create another file when authoring them.

Per-rule investigation playbooks live in [rules/](rules/) when that directory is present.

### Recorded conclusions

You may conclude:

> Superficially similar but intentionally different; do not merge.

That is a successful audit result. Record the decision in `.coherent/decisions.json` with `coherent review dismiss <fingerprint> --reason "..."`. For live Stale compatibility, also supply `--expires-at <iso>` or `--removal-milestone <text>`; if the signal is not compatibility, use `--not-compatibility`. Note the distinction in `.coherent/ARCHITECTURE.md` (authoritative representations, terminology, or compatibility consumer) so later agents do not reopen the question. Architecture prose alone does not remove the finding from `plan`.

You may also conclude that a hybrid signal is a candidate only, or that evidence is too weak to delete. Use `coherent review defer` when the finding should stay visible but not become `fix next` work.

### Managed investigation

1. Follow [full-cleanup.md](full-cleanup.md) for compatibility and initialization.
2. Run `coherent audit`. Use its output; do not invent a findings file or report.
3. Ingest the deterministic findings. Treat `candidate` as a prompt to look, not a license to delete.
4. Inspect the files, symbols, and workflows the findings or architecture point to. For a full-repository audit, also apply [semantic-triage.md](semantic-triage.md) so rules without mechanical detectors are not silently skipped. Do not read every file.
5. Group related findings (same file, same concept, same compatibility path).
6. Identify prerequisite relationships from the catalog and from actual callers.
7. Mark findings that would disappear if a higher-value deletion landed first (for example an E06 on a function that is already A08-dead).
8. Write confirmed vs candidate conclusions. Investigators return proposals;
   one coordinator writes both decisions and architecture notes, then verifies
   the final state. For one finding, persist it with `coherent review confirm|dismiss|defer`. For several findings, send a JSON array to `coherent review apply --input path/to/reviews.json` (stdin remains supported); each item may use `"fingerprint"` or `"fingerprints"` with one shared decision and reason. A multi-fingerprint item is rejected unless every target belongs to the same evidence group shown by the default `coherent review queue`; use `--group-by rule` only for navigation, not as permission for one conclusion. Supported judgment fields (`semanticEquivalence`, `authoritativeConcept`, `missingEvidence`, `reconsiderWhen`) are validated and persisted; unknown fields are rejected. Use `review apply --dry-run` to preview exact targets, evidence-group receipts, and replacements. A dismissed or deferred live Stale compatibility item also needs `"expiresAt"` or `"removalMilestone"`; a dismissed false signal uses `"notCompatibility": true`. Deferred reviews also need `missingEvidence` or `reconsiderWhen`. It runs one audit and writes nothing if any item is invalid. Group only findings supported by the same evidence; do not mass-dismiss heterogeneous candidates to make the plan empty. Update architecture notes when you establish an authoritative concept. A reason that only cites the architecture document or a cleanup phase is not sufficient.
9. All candidates, including deterministic A08 unused exports, stay `needs_review` until `coherent review confirm`. Hybrid and semantic findings also require confirmation. A deterministic detection mode does not make a candidate safe to delete.

For reachability dismissals, name the actual caller, decorator/registration,
port-to-provider binding, or documented external consumer. A shared method
name, a barrel export, an allowlist string, or the word "service" is not proof
of use. Group only symbols whose individual reachability you checked; split
different mechanisms into separate reasons. Missing evidence means defer,
not dismiss. Successful tests alone do not establish production reachability.

See [taxonomy.md](taxonomy.md) for rule meanings. See [plan.md](plan.md) and [cleanup-planning.md](cleanup-planning.md) before turning conclusions into work.
