import type { Inventory } from "../inventory.js";

const NEEDS_COMPLETION = "requires human or agent completion";
export const DISCOVERED_OPEN = "<!-- coherent:discovered -->";
export const DISCOVERED_CLOSE = "<!-- /coherent:discovered -->";

export function wrapDiscovered(body: string): string {
  return `${DISCOVERED_OPEN}\n${body.trim()}\n${DISCOVERED_CLOSE}`;
}

export function generateArchitectureMarkdown(inventory: Inventory): string {
  const packages = inventory.packages
    .map((pkg) => `- \`${pkg.name}\` (\`${pkg.path}\`)`)
    .join("\n");
  const frameworks =
    inventory.frameworks.length > 0
      ? inventory.frameworks.map((name) => `- ${name}`).join("\n")
      : "- None detected from package dependencies.";
  const sourceDirs = bulletOrNone(inventory.sourceDirectories);
  const testDirs = bulletOrNone(inventory.testDirectories);
  const entrypoints = bulletOrNone(inventory.entrypoints);
  const modules = bulletOrNone(inventory.topLevelModules);
  const persistence =
    inventory.persistenceLibraries.length > 0
      ? inventory.persistenceLibraries.map((name) => `- \`${name}\``).join("\n")
      : "- None detected from package dependencies.";
  const publicApis = publicApiBullets(inventory);
  const depCount = Object.keys(inventory.dependencies).length;
  const devDepCount = Object.keys(inventory.devDependencies).length;

  return `# Architecture

This file is durable project context for Coherent. Automatically discovered
facts are labeled. Do not invent architecture for unmarked semantic sections.

## System purpose

> Status: ${NEEDS_COMPLETION}

TODO: What this system is for, who it serves, and what success means.

## Major applications/services

> Status: automatically discovered (packages and frameworks)

${wrapDiscovered(`Package manager: \`${inventory.packageManager}\`

Packages:

${packages || "- No package.json files found."}

Detected frameworks:

${frameworks}

Languages: ${inventory.languages.length > 0 ? inventory.languages.join(", ") : "none detected"}

Approximate size: ${inventory.fileCount} files, ${inventory.lineCount} source lines.

Dependencies: ${depCount} runtime, ${devDepCount} development.`)}

> Additional service boundaries ${NEEDS_COMPLETION}.

## Architectural layers

> Status: ${NEEDS_COMPLETION}

${wrapDiscovered(`Observed source directories (not inferred layers):

${sourceDirs}

Observed top-level modules:

${modules}`)}

TODO: Name the real layers and what each may depend on.

## Domain concepts

> Status: ${NEEDS_COMPLETION}

TODO: List the core domain concepts and the module that owns each one.

## Canonical terminology

> Status: ${NEEDS_COMPLETION}

TODO: The preferred name for each concept, plus names that must not be introduced.

## Data ownership

> Status: ${NEEDS_COMPLETION}

TODO: Which module owns which data, and who may write it.

## Authoritative representations

> Status: ${NEEDS_COMPLETION}

TODO: For each important concept, which type, table, or document is authoritative.

## Important invariants

> Status: ${NEEDS_COMPLETION}

TODO: Rules that must remain true after cleanup. Prefer behavioral statements.

## Provider/external boundaries

> Status: ${NEEDS_COMPLETION}

TODO: External systems this repository talks to, and the module that owns each client.

## Persistence boundaries

> Status: partially discovered

${wrapDiscovered(`Observed persistence libraries:

${persistence}`)}

TODO: Which stores are authoritative, and which modules may query them.

## Public APIs

> Status: automatically discovered (package entrypoints and exports)

${wrapDiscovered(`Declared entrypoints and exports:

${publicApis}

Probable entrypoint files:

${entrypoints}`)}

> HTTP, RPC, and CLI contracts beyond package.json ${NEEDS_COMPLETION}.

## Async/event boundaries

> Status: ${NEEDS_COMPLETION}

TODO: Queues, cron jobs, subscriptions, and who owns delivery and retry.

## Critical workflows

> Status: ${NEEDS_COMPLETION}

TODO: The paths that must keep working during cleanup, and the tests that cover them.

## Transitional/legacy architecture

> Status: ${NEEDS_COMPLETION}

TODO: What is known to be temporary, what replaces it, and what must not grow.

## Forbidden dependency directions

> Status: ${NEEDS_COMPLETION}

TODO: Edges that must not exist (for example domain must not import HTTP adapters).

## Testing philosophy

> Status: partially discovered

${wrapDiscovered(`Observed test directories:

${testDirs}`)}

TODO: What a good test asserts here, what must not be mocked, and where characterization tests live.

<!-- coherent:architecture-schema 1 -->
`;
}

function bulletOrNone(values: string[]): string {
  if (values.length === 0) return "- None discovered.";
  return values.map((value) => `- \`${value}\``).join("\n");
}

function publicApiBullets(inventory: Inventory): string {
  const lines: string[] = [];
  for (const pkg of inventory.packages) {
    if (pkg.main) {
      lines.push(`- \`${pkg.name}\` main: \`${pkg.main}\``);
    }
    for (const bin of pkg.bins) {
      lines.push(`- \`${pkg.name}\` bin: \`${bin.name}\` → \`${bin.path}\``);
    }
    for (const exported of pkg.exports ?? []) {
      lines.push(`- \`${pkg.name}\` export: \`${exported}\``);
    }
  }
  return lines.length > 0 ? lines.join("\n") : "- None declared in package.json.";
}
