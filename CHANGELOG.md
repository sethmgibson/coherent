# Changelog

All notable changes to Coherent are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versions up to 0.2.0 were distributed from GitHub only
(`github:sethmgibson/coherent`) and were not tagged. Their dates are those of
the last commit carrying that version.

## [Unreleased]

### Added

- Contributor documentation: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`, issue templates (bug report, wrong finding, feature proposal),
  and a pull request template.
- This changelog.

### Changed

- Rewrote the README with a quick start, usage examples, CLI reference,
  configuration, FAQ, and badges.
- Documented `coherent.json` (`ignore`, `python`) and `COHERENT_PYTHON`, and
  listed which rules have mechanical detectors in the audit reference.

## [0.2.0] - 2026-10-27

### Added

- Whole-system simplification (F01) as the opening review for a general
  cleanup. It is independently selectable and is not a prerequisite for other
  rules.
- Conversational, class-by-class review: the agent reports findings before
  editing, then offers fixes, deeper investigation, or the next problem class.
- Targeted evidence mode: `audit --evidence --paths <paths...> --rules <ids...>`
  returns source observations without review state, fingerprints, or planning.
- `migrate` command that previews converting legacy inventory-style
  architecture context, writing only with `--write`.
- Data-access playbook covering derivable values, N+1 queries, unnecessary
  loading, superseded requests, and expensive query shapes.
- Python analysis through a standard-library `ast` sidecar (CPython 3.9+) for
  A08, B04, C03, and D03, including Python-aware `check --changed` importers.
- One-command Codex and Cursor installer (`coherent install`) that installs the
  project CLI through the detected package manager and verifies the skill/CLI
  handshake before copying skill files. `--skills-only` copies skill files
  without a project dependency.
- `version` command with `--expect-workflow`, `--expect-detector`, and
  `--require-capability` runtime compatibility checks.
- `doctor --staged` and `doctor --ref <ref>` to validate exact Git snapshots.

### Changed

- Mechanical reviews are bound to source evidence; changed content reopens a
  finding without rewriting stored state.
- Python sidecar responses and `--rules` selections are validated. Selecting a
  rule without a mechanical detector fails with an explicit error.
- Detector precision improvements across several rules.
- Dependency updates that clear `pnpm audit` findings.

### Removed

- `plan`, `fix next`, and `inspect` are retired. They exit non-zero with a
  `scheduler_retired` error; cleanup sequencing belongs to the coding agent.
  Stored baselines, reviews, and catalog phase exports remain readable.

## [0.1.0] - 2026-08-31

### Added

- Initial provider-neutral maintainability skill and local CLI for backend and
  large AI-built TypeScript codebases.
- Rule catalog with detection modes (`deterministic`, `hybrid`, `semantic`),
  generated taxonomy and phase references, and per-rule playbooks.
- `init` and `refresh` for `.coherent/ARCHITECTURE.md` with fenced,
  machine-discovered sections that never overwrite authored prose.
- `audit`, `baseline`, and `check` with stable, line-independent fingerprints.
  `check` fails only on new confirmed high or critical deterministic findings,
  and `check --changed` scopes to the Git diff plus transitive importers.
- Durable review decisions in `.coherent/decisions.json` (`review confirm`,
  `dismiss`, `defer`, `apply`, `queue`, `prune`) with cross-process locking
  and atomic writes.
- `doctor` and `doctor --deep` for stored-state integrity.
- Repository tsconfig parsing (path aliases and project references) and
  bounded static NestJS reachability analysis.
- Codex and Cursor skill adapters, with ESLint, Knip, and CI validation.

[Unreleased]: https://github.com/sethmgibson/coherent/compare/3031a4c...HEAD
[0.2.0]: https://github.com/sethmgibson/coherent/compare/5d9a596...3031a4c
[0.1.0]: https://github.com/sethmgibson/coherent/commits/5d9a596
