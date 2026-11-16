# Security Policy

## Supported versions

Coherent is pre-1.0. Security fixes are made on the `master` branch and
included in the next release. Older versions do not receive backported fixes.

| Version | Supported |
|---|---|
| Latest release and `master` | Yes |
| Anything older | No |

## Reporting a vulnerability

**Do not open a public issue for security problems.**

Report vulnerabilities privately through GitHub:
[Report a vulnerability](https://github.com/sethmgibson/coherent/security/advisories/new).

Include as much of the following as you can:

- the affected command or file, and the Coherent version (`coherent version`)
- steps to reproduce, ideally with a minimal repository
- the impact you observed or expect

You can expect an acknowledgement within a week. Once the issue is confirmed,
we will agree on a disclosure timeline with you and credit you in the advisory
unless you prefer to stay anonymous.

## Scope

Coherent runs locally and has no network services or telemetry. The areas most
relevant to security are:

- **The installer** (`coherent install` / `update`), which writes skill files,
  runs your package manager with fixed arguments, and can register Cursor or
  Git hooks when you pass explicit flags.
- **Subprocesses**: the Python analysis sidecar (`python/analyze.py`), Git
  commands used by `check --changed` and `doctor --staged` / `--ref`, and the
  package manager during project installation.
- **File writes**: any path where Coherent writes outside `.coherent/`, the
  installed skill directories, or an explicit `--output` path.

Coherent analyzes source statically and never executes the code under
analysis. A report that it does would be in scope.

Out of scope: findings that Coherent reports or misses in your code (use the
*Finding is wrong* issue template instead), and vulnerabilities in third-party
dependencies that don't affect Coherent's use of them.
