import { isAbsolute, relative, resolve } from "node:path";
import { createAnalysisContext } from "../analysis/context.js";
import { collectPythonFindings } from "../analysis/python.js";
import { stat } from "node:fs/promises";
import { toPosix, walkFiles } from "../inventory-walk.js";
import { isTsLikeSource } from "../inventory-scan.js";
import { loadConfig } from "../config.js";
import { collectInventory } from "../inventory.js";
import type { RuleId } from "../catalog/types.js";
import { RULE_IDS } from "../catalog/rules.js";
import type { Evidence } from "./finding-factory.js";
import { detectDeadCode } from "../detectors/dead-code.js";
import { detectStaleCompatibility } from "../detectors/stale-compat.js";
import { detectStringProtocols } from "../detectors/string-protocols.js";
import { detectDuplicateRepresentations } from "../detectors/duplicate-reps.js";
import { detectPrematureAbstraction } from "../detectors/premature-abstraction.js";
import { detectExcessiveIndirection } from "../detectors/indirection.js";
import { detectBooleanExplosion } from "../detectors/boolean-explosion.js";
import { detectContextExplosion } from "../detectors/context-explosion.js";
import { detectSwallowedErrors } from "../detectors/swallowed-errors.js";
import { detectDependencyCreep } from "../detectors/dependency-creep.js";
import { detectRedundantDbAccess } from "../detectors/redundant-db.js";
import { detectSequentialIo } from "../detectors/sequential-io.js";
import { detectAlgorithmicComplexity } from "../detectors/complexity.js";

/** No reviews, baselines, planning, fingerprints or metadata writes. */
export async function collectEvidence(root: string, options: {
  include?: string[];
  rules?: RuleId[];
} = {}) {
  const rules = new Set(options.rules ?? RULE_IDS);
  for (const rule of rules) {
    if (!(RULE_IDS as readonly string[]).includes(rule)) throw new Error(`Unknown rule: ${rule}`);
    if (options.rules && !["A03", "A06", "A07", "A08", "B03", "B04", "C03", "C04", "D01", "D03", "E01", "E05", "E06"].includes(rule)) {
      throw new Error(`${rule} requires semantic investigation; no mechanical detector is implemented.`);
    }
  }
  const config = await loadConfig(root);
  const requested = options.include?.map(path => {
    const target = toPosix(relative(resolve(root), resolve(root, path)));
    if (target === ".." || target.startsWith("../") || isAbsolute(target)) {
      throw new Error(`Evidence path must be inside the repository: ${path}`);
    }
    return target;
  });
  let include: string[] | undefined;
  if (requested) {
    const files = await walkFiles(root, new Set(config.ignore ?? []));
    const selected = new Set<string>();
    for (const path of requested) {
      const info = await stat(resolve(root, path)).catch((error: unknown) => {
        throw new Error(`Incomplete analysis: failed to load source file ${path}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
      });
      const matches = files.filter(file => file.relativePath === path ||
        (info.isDirectory() && (path === "" || file.relativePath.startsWith(path + "/"))));
      if (!info.isDirectory() && matches.length === 0) throw new Error(`Evidence path is ignored or unsupported: ${path}`);
      for (const file of matches) selected.add(file.relativePath);
    }
    include = [...selected].sort();
  }
  const inventory = await collectInventory(root, config, include);
  if (include?.length === 0) return { inventory, observations: [] as Evidence[] };
  const sourcePaths = include ?? (await walkFiles(root, new Set(config.ignore ?? []))).map(file => file.relativePath);
  const hasTsSource = sourcePaths.some(isTsLikeSource);
  const ctx = await createAnalysisContext(root, hasTsSource ? inventory : { ...inventory, tsconfigFiles: [] }, config, include ? { include } : {});
  const observations: Evidence[] = [];
  // Explicit calls keep the supported detector surface small and inspectable.
  if (rules.has("A08")) observations.push(...detectDeadCode(ctx));
  if (rules.has("A07")) observations.push(...detectStaleCompatibility(ctx));
  if (rules.has("A03")) observations.push(...detectStringProtocols(ctx));
  if (rules.has("A06")) observations.push(...detectDuplicateRepresentations(ctx));
  if (rules.has("B03")) observations.push(...detectPrematureAbstraction(ctx));
  if (rules.has("B04")) observations.push(...detectExcessiveIndirection(ctx));
  if (rules.has("C03")) observations.push(...detectBooleanExplosion(ctx));
  if (rules.has("C04")) observations.push(...detectContextExplosion(ctx));
  if (rules.has("D03")) observations.push(...detectSwallowedErrors(ctx));
  if (rules.has("D01")) observations.push(...await detectDependencyCreep(ctx));
  if (rules.has("E01")) observations.push(...detectRedundantDbAccess(ctx));
  if (rules.has("E05")) observations.push(...detectSequentialIo(ctx));
  if (rules.has("E06")) observations.push(...detectAlgorithmicComplexity(ctx));
  if (["A08", "B04", "C03", "D03"].some(rule => rules.has(rule as RuleId))) {
    observations.push(...(await collectPythonFindings(root, config, include)).filter(item => rules.has(item.ruleId)));
  }
  return { inventory, observations };
}
