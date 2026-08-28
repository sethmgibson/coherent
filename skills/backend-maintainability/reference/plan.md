# `plan`

Turn findings into a cleanup DAG. Do not sort by rule ID, severity, or phase alone.

```bash
coherent plan
coherent plan --json
```

The CLI runs a fresh audit, groups related findings, adds prerequisite and re-scan edges, scores unlocked nodes, and writes `.backend/plan.json`. It does not execute the plan.

Follow [cleanup-planning.md](cleanup-planning.md). Next command is usually `coherent fix next`.
