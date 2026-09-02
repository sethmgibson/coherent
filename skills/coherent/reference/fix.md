# `fix next`

Perform one bounded cleanup node.

```bash
coherent fix next
coherent fix next --json
coherent fix next --performance
```

The CLI selects the next unlocked node and prints its work brief without
creating a support file. It warns when any likely target already has
uncommitted Git changes; preserve and reconcile those edits before modifying
the node. Use `--performance` only to select from the advisory performance
rules. You perform the edit. Follow [fix-safety.md](fix-safety.md) for the
before / during / after checklist.

Do not rewrite the repository wholesale.
