import type { AnalysisContext } from "../analysis/context.js";
import { importedPackageNames } from "../analysis/inspect.js";
import { makeFinding } from "../audit/finding-factory.js";
import type { Finding } from "../domain/finding.js";

const OVERLAP_FAMILIES = [
  ["lodash", "lodash-es", "underscore"],
  ["moment", "dayjs", "date-fns"],
  ["axios", "node-fetch", "got", "request", "superagent"],
  ["winston", "pino", "bunyan"],
];

const IMPLICIT_USE = new Set([
  "typescript",
  "tsx",
  "ts-node",
  "ts-morph",
  "commander",
  "vitest",
  "eslint",
  "prettier",
  "nodemon",
]);

export function detectDependencyCreep(ctx: AnalysisContext): Finding[] {
  const imported = importedPackageNames(ctx.sourceFiles);
  const declared = {
    ...ctx.inventory.dependencies,
    ...ctx.inventory.devDependencies,
  };
  const runtime = ctx.inventory.dependencies;
  const findings: Finding[] = [];

  for (const name of Object.keys(runtime)) {
    if (name.startsWith("@types/")) continue;
    if (IMPLICIT_USE.has(name)) continue;
    if (imported.has(name)) continue;
    findings.push(
      makeFinding({
        ruleId: "D01",
        identity: `unused-dep:${name}`,
        title: "Apparently unused dependency",
        severity: "medium",
        confidence: "high",
        status: "confirmed",
        explanation: `'${name}' is declared in dependencies but no import or dynamic import of that package was found.`,
        evidence: {
          summary: `Declared ${name}@${runtime[name] ?? "?"}; no source import.`,
          details: [
            "DevDependencies and @types packages are not reported here.",
            "Packages used only via CLI or config may be false positives — review before removal.",
          ],
        },
        locations: [{ file: "package.json", symbol: name }],
        affectedSymbols: [name],
      }),
    );
  }

  for (const family of OVERLAP_FAMILIES) {
    const present = family.filter((name) => name in declared);
    if (present.length < 2) continue;
    findings.push(
      makeFinding({
        ruleId: "D01",
        identity: `overlap-dep:${present.slice().sort().join("+")}`,
        title: "Overlapping dependency family",
        severity: "low",
        confidence: "high",
        status: "candidate",
        explanation: `More than one package from the same known family is declared: ${present.join(", ")}.`,
        evidence: {
          summary: `Overlapping family: ${present.join(", ")}.`,
          details: ["This is a small known-family check, not a dependency ontology."],
        },
        locations: present.map((name) => ({ file: "package.json", symbol: name })),
        affectedSymbols: present,
      }),
    );
  }
  return findings;
}
