import { stat } from "node:fs/promises";
import { join } from "node:path";
import { createAnalysisContext } from "../analysis/context.js";
import { ARCHITECTURE_FILE, BACKEND_DIR, loadConfig } from "../config.js";
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
import { writeFindingsFile, type FindingsFile } from "./store.js";

export interface AuditResult {
  inventory: Inventory;
  findings: Finding[];
  findingsPath: string;
  durationMs: number;
  file: FindingsFile;
}

export async function runAudit(root: string): Promise<AuditResult> {
  const started = Date.now();
  const config = await loadConfig(root);
  const inventory = await collectInventory(root, config);
  const ctx = await createAnalysisContext(root, inventory, config);
  const findings = collectFindings(ctx);
  const durationMs = Date.now() - started;
  const confirmed = findings.filter((finding) => finding.status === "confirmed");
  const candidates = findings.filter((finding) => finding.status === "candidate");
  const architecturePath = join(root, BACKEND_DIR, ARCHITECTURE_FILE);
  const hasArchitecture = await fileExists(architecturePath);
  const file: FindingsFile = {
    generatedAt: new Date().toISOString(),
    root,
    durationMs,
    ...(hasArchitecture ? { architecturePath } : {}),
    findings,
    confirmed,
    candidates,
    groups: groupFindings(findings),
    metrics: computeMetrics(findings),
  };
  const path = await writeFindingsFile(file);
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
