import { stat } from "node:fs/promises";
import { join } from "node:path";
import { createAnalysisContext } from "../analysis/context.js";
import { ARCHITECTURE_FILE, FINDINGS_FILE, PORTABLE_ROOT, loadConfig } from "../config.js";
import { resolveStateDir } from "../state-dir.js";
import { collectInventory, type Inventory } from "../inventory.js";
import type { Finding } from "../domain/finding.js";
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
import { computeMetrics } from "./metrics.js";
import { groupFindings } from "../plan/group.js";
import { assertUniqueFingerprints, mergeFindingsByFingerprint } from "./dedupe.js";
import { writeFindingsFile, type FindingsFile } from "./store.js";

export interface AuditResult {
  inventory: Inventory;
  findings: Finding[];
  findingsPath: string;
  durationMs: number;
  file: FindingsFile;
}

export interface AuditOptions {
  /** Parse only these repo-relative paths. Full-repo ts-morph when omitted. */
  include?: string[];
  /** Write `.coherent/findings.json`. Default true. Scoped checks skip persist. */
  persist?: boolean;
}

export async function runAudit(
  root: string,
  options: AuditOptions = {},
): Promise<AuditResult> {
  const started = Date.now();
  const config = await loadConfig(root);
  const inventory = await collectInventory(root, config);
  const findings =
    options.include && options.include.length === 0
      ? []
      : mergeFindingsByFingerprint(
          collectFindings(
            await createAnalysisContext(
              root,
              inventory,
              config,
              options.include ? { include: options.include } : {},
            ),
          ),
        );
  assertUniqueFingerprints(findings);
  const durationMs = Date.now() - started;
  const confirmed = findings.filter((finding) => finding.status === "confirmed");
  const candidates = findings.filter((finding) => finding.status === "candidate");
  const state = resolveStateDir(root);
  const architecturePath = join(state.path, ARCHITECTURE_FILE);
  const hasArchitecture = await fileExists(architecturePath);
  const file: FindingsFile = {
    generatedAt: new Date().toISOString(),
    root: PORTABLE_ROOT,
    durationMs,
    ...(hasArchitecture ? { architecturePath: `${state.name}/${ARCHITECTURE_FILE}` } : {}),
    findings,
    confirmed,
    candidates,
    groups: groupFindings(findings),
    metrics: computeMetrics(findings),
  };
  const path =
    options.persist === false ? join(state.path, FINDINGS_FILE) : await writeFindingsFile(file, root);
  return { inventory, findings, findingsPath: path, durationMs, file };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function collectFindings(ctx: Parameters<typeof detectDeadCode>[0]): Finding[] {
  return [
    ...detectDeadCode(ctx),
    ...detectStaleCompatibility(ctx),
    ...detectStringProtocols(ctx),
    ...detectDuplicateRepresentations(ctx),
    ...detectPrematureAbstraction(ctx),
    ...detectExcessiveIndirection(ctx),
    ...detectBooleanExplosion(ctx),
    ...detectContextExplosion(ctx),
    ...detectSwallowedErrors(ctx),
    ...detectDependencyCreep(ctx),
    ...detectRedundantDbAccess(ctx),
    ...detectSequentialIo(ctx),
    ...detectAlgorithmicComplexity(ctx),
  ];
}
