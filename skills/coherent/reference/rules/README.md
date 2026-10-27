# Rule playbooks

Investigation procedures for the catalog rules. The table in
[taxonomy.md](../taxonomy.md) supplies the conversational review order and rule
metadata from `src/catalog/rules.ts`. Open the matching `<ID>.md` for the current
class; do not load every playbook or turn the index into a project tracking file.

[Whole-system simplification (F01)](F01.md) opens a fresh general cleanup and
can also be requested independently. It questions entire workflows and
capabilities before their implementation. It can be skipped and is not a
prerequisite for existing classes.

Follow [semantic-audits.md](../semantic-audits.md): inspect source, explain
findings in chat, and offer fixes or the next class. No CLI, initialization or
saved decisions are required. Existing architecture context helps but does not
have to be generated. User-requested fixes follow
[fix-safety.md](../fix-safety.md).

Detector identities in the playbooks describe optional tool evidence. They do
not require a scan or stored finding before an agent can investigate. Semantic
and hybrid conclusions need judgment; shape alone does not establish equivalence.
An intentional distinction or missing evidence can be the correct outcome.

## Optional durable context and advanced recording

Ordinary findings, vocabulary, authoritative patterns and intentional
distinctions stay in the conversation. References below to writing architecture
notes apply only when the user requested durable context. Preserve authored
content and use existing documentation rather than creating another file.

Per-rule sections labeled **Advanced recording** apply only when the user
explicitly selects persistent reviews. Use
[full-cleanup.md](../full-cleanup.md) and the advanced section of
[semantic-audits.md](../semantic-audits.md). Review an existing mechanical finding
instead of duplicating it; semantic-only findings use the existing `Finding`
shape in `decisions.json`. A recorded dismissal is distinct from fixing a real
issue. Never mass-dismiss unrelated candidates to clear a listing.
