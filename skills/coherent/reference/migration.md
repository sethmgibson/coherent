# Optional migration

The bounded skill works without advanced state, including in repositories that
already contain baseline.json or decisions.json. It does not load or repair
those files. Existing configured hooks and direct advanced commands keep their
meaning; no project is silently enrolled or removed from advanced cleanup.

```bash
coherent migrate . --json
coherent migrate . --write
```

The default is a read-only preview: proposed architecture before/after, historical
reviews lacking current source evidence, and hashes identifying stored files.
No support files, backups, baseline regeneration or directory renames occur.

`--write` converts only Coherent-managed discovered fences and the architecture
schema marker into focused context. All text outside those fences is retained,
including unknown authored sections. Baseline and review files remain byte-for-byte
unchanged. Conversion is atomic and refuses a concurrent architecture change.
Running it again is idempotent. Malformed stored JSON fails before writes.

New advanced reviews bind to source evidence. Conservative per-file content hashes (ignoring only leading/trailing whitespace)
or evidence changes reopen a finding even when its stable fingerprint is unchanged. Legacy
reviews remain readable/history, but mechanical decisions without an evidence
hash require revalidation before applying to current source. Revalidate the
relevant advanced group when needed; ordinary work never needs queue triage.
Pure semantic exact reviews retain their existing detector-version behavior.

Corrected detectors bump only affected rule revisions. An existing baseline
is not automatically reset; the advanced commands report stale contracts.
Use the established explicit baseline refresh only when the team wants that
comparison change. Do not infer 'fixed' from an old dismissal reason or invent
source hashes for historical decisions. No resolution ledger is added.

Rule IDs, public Finding exports, legacy CLI JSON envelopes, stored version-1
schemas, configured hooks and package pins remain supported. Optional evidence
hash fields do not change stable finding fingerprints. New catch anchors affect
D03 identities only, and its rule revision marks old decisions stale.

For skill updates, retain edited copies. The existing installer refreshes known
managed stubs and reference fences; compare a skipped edited SKILL.md with the
canonical skill instead of overwriting it. Skill-only adoption does not alter
project manifests or hooks. Update explicitly selected integrations separately.
