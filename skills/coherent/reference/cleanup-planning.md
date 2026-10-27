# Agent-owned cleanup sequencing

The coding agent chooses worthwhile changes and identifies real prerequisites
from source, contracts and current user intent. Coherent no longer builds a
cleanup DAG, scores findings, or chooses the next fix. Its legacy catalog phase
and prerequisite fields remain for public import compatibility.

Start from the requested outcome, investigate a useful scope, explain proposals,
and implement only authorized changes. Group work when it shares a contract or
validation boundary. After consolidation or deletion, inspect what became
obsolete. Do not optimize a path that a larger simplification would remove.

Use [audit.md](audit.md) when mechanical evidence helps and
[fix-safety.md](fix-safety.md) for implementation and validation. Findings and
progress stay in chat unless durable reviews are explicitly requested. For
those reviews and configured CI checks, see [full-cleanup.md](full-cleanup.md).
