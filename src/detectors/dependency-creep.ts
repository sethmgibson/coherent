import { ts } from "ts-morph";
import { loadConfig } from "../config.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { walkFiles } from "../inventory-walk.js";
import type { AnalysisContext } from "../analysis/context.js";
import { importedPackageNames, packageNameFromSpecifier } from "../analysis/inspect.js";
import { makeEvidence } from "../audit/finding-factory.js";
import type { Evidence } from "../audit/finding-factory.js";

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

export async function detectDependencyCreep(ctx: AnalysisContext): Promise<Evidence[]> {
  const imported = importedPackageNames(ctx.sourceFiles);
  for (const file of await walkFiles(ctx.root, new Set((await loadConfig(ctx.root)).ignore ?? []))) {
    if (/\.[cm]?jsx?$/.test(file.name)) {
      const source = ts.createSourceFile(file.relativePath, await readFile(file.absolutePath, "utf8"), ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && node.expression.getText(source) === "require" && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
          const name = packageNameFromSpecifier(node.arguments[0].text);
          if (name) imported.add(name);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    if (!file.name.endsWith(".css")) continue;
    const css = await readFile(file.absolutePath, "utf8");
    for (const match of css.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/g)) {
      const name = packageNameFromSpecifier(match[1]!);
      if (name) imported.add(name.replace(/^~/, ""));
    }
  }
  for (const pkg of ctx.inventory.packages) {
    const manifest = JSON.parse(await readFile(join(ctx.root, pkg.path), "utf8")) as { scripts?: Record<string, string> };
    for (const name of Object.keys(pkg.dependencies)) {
      const command = name.split("/").at(-1)!;
      const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (Object.values(manifest.scripts ?? {}).some(script => new RegExp(`(?:^|[\\s;&|])${escaped}(?=$|[\\s;&|])`).test(script))) imported.add(name);
    }
  }
  const declared = {
    ...ctx.inventory.dependencies,
    ...ctx.inventory.devDependencies,
  };
  const runtime = ctx.inventory.dependencies;
  const findings: Evidence[] = [];

  for (const name of Object.keys(runtime)) {
    if (name.startsWith("@types/")) continue;
    if (IMPLICIT_USE.has(name)) continue;
    if (imported.has(name)) continue;
    findings.push(
      makeEvidence({
        ruleId: "D01",
        identity: `unused-dep:${name}`,
        title: "Apparently unused dependency",
        severity: "medium",
        confidence: "medium",
        status: "candidate",
        explanation: `'${name}' is declared in dependencies but no import or dynamic import of that package was found.`,
        evidence: {
          summary: `Declared ${name}@${runtime[name] ?? "?"}; no source import.`,
          details: [
            "DevDependencies and @types packages are not reported here.",
            "Packages used only via CLI or config may be false positives — review before removal.",
          ],
        },
        locations: ctx.inventory.packages.filter(pkg => name in pkg.dependencies).map(pkg => ({ file: pkg.path, symbol: name })),
        affectedSymbols: [name],
      }),
    );
  }

  for (const family of OVERLAP_FAMILIES) {
    const present = family.filter((name) => name in declared);
    if (present.length < 2) continue;
    findings.push(
      makeEvidence({
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
        locations: present.flatMap(name => ctx.inventory.packages
          .filter(pkg => name in pkg.dependencies || name in pkg.devDependencies)
          .map(pkg => ({ file: pkg.path, symbol: name }))),
        affectedSymbols: present,
      }),
    );
  }
  return findings;
}
