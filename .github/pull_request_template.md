## What and why

<!-- What does this change, and what problem does it solve? Link related issues. -->

## How it was validated

<!-- Check what you ran. See CONTRIBUTING.md for which checks apply. -->

- [ ] `pnpm test`
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm check:skill-docs` (catalog, phases, or generated references changed)
- [ ] `pnpm check:unique-fingerprints` (finding identity changed)
- [ ] `pnpm build` and `pnpm check:package` (CLI or exports changed)

## Checklist

- [ ] Deterministic findings stay mechanically provable; semantic and hybrid conclusions still need review.
- [ ] Read-only commands still write no metadata without an explicit flag.
- [ ] User-facing behavior changes are reflected in the README or `skills/coherent/reference/`.
- [ ] `CHANGELOG.md` has an entry under *Unreleased* (if user-facing).
