# Coherent repository guidance

## Start here

- Read `.coherent/ARCHITECTURE.md` before changing structure or ownership.
- Treat `skills/coherent/SKILL.md` as the canonical agent workflow. Files under
  `.agents/` and `.cursor/` are discovery adapters, not separate methodologies.
- Use Node.js 20+ and pnpm. Do not substitute npm-generated lockfiles.

## Validation

- Run `pnpm test` and `pnpm typecheck` after TypeScript changes.
- Run `pnpm check:skill-docs` after changing the rule catalog, cleanup phases,
  or generated skill references.
- Run `pnpm check:unique-fingerprints` after changing finding identity or
  fingerprint behavior.
- Run `pnpm build` when changing the CLI or package exports.

## Project invariants

- `src/catalog/rules.ts` and `src/catalog/phases.ts` are the sources of truth;
  generated reference markdown must stay in sync.
- Keep deterministic findings mechanical. Semantic conclusions require agent
  or human review, and hybrid findings remain candidates until confirmed.
- Preserve Coherent's write boundaries: read-only commands do not create
  metadata unless the user supplies an explicit output or integration flag.
- Keep optional integrations additive and safe around user-authored files.
  Never overwrite content outside Coherent-managed fences.
