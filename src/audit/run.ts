import { stat } from "node:fs/promises";
import { join } from "node:path";
import { createAnalysisContext } from "../analysis/context.js";
import { ARCHITECTURE_FILE, PORTABLE_ROOT, loadConfig } from "../config.js";
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
import type { Metric } from "./metrics.js";
import { groupFindings } from "../plan/group.js";
import type { FindingGroup } from "../plan/types.js";
import { assertUniqueFingerprints, mergeFindingsByFingerprint } from "./dedupe.js";
import { portableRuntimeIdentity, type PortableRuntimeIdentity } from "../runtime.js";

export interface FindingsFile {
  runtime: PortableRuntimeIdentity;
  generatedAt: string;
  root: string;
  durationMs: number;
  architecturePath?: string;
  findings: Finding[];
  confirmed: Finding[];
  candidates: Finding[];
  groups: FindingGroup[];
  metrics: Metric[];
}

export interface CompactFindingsFile {
  runtime: PortableRuntimeIdentity;
  generatedAt: string;
  root: string;
  durationMs: number;
  architecturePath?: string;
  summary: {
    total: number;
    confirmed: number;
    candidates: number;
    byRule: Array<{
      ruleId: Finding["ruleId"];
      total: number;
      confirmed: number;
      candidates: number;
    }>;
  };
  findings: Array<
    Pick<
      Finding,
      | "fingerprint"
      | "ruleId"
      | "identity"
      | "severity"
      | "confidence"
      | "detectionMode"
      | "status"
      | "evidence"
      | "locations"
    >
  >;
}

export interface AuditResult {
  inventory: Inventory;
  findings: Finding[];
  durationMs: number;
  file: FindingsFile;
}

export interface AuditOptions {
  /** Parse only these repo-relative paths. Full-repo ts-morph when omitted. */
  include?: string[];
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
    runtime: portableRuntimeIdentity(),
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
  return { inventory, findings, durationMs, file };
}

export function compactFindingsFile(file: FindingsFile): CompactFindingsFile {
  const byRule = new Map<
    Finding["ruleId"],
    CompactFindingsFile["summary"]["byRule"][number]
  >();
  for (const finding of file.findings) {
    const counts = byRule.get(finding.ruleId) ?? {
      ruleId: finding.ruleId,
      total: 0,
      confirmed: 0,
      candidates: 0,
    };
    counts.total += 1;
    counts[finding.status === "confirmed" ? "confirmed" : "candidates"] += 1;
    byRule.set(finding.ruleId, counts);
  }
  return {
    runtime: file.runtime,
    generatedAt: file.generatedAt,
    root: file.root,
    durationMs: file.durationMs,
    ...(file.architecturePath ? { architecturePath: file.architecturePath } : {}),
    summary: {
      total: file.findings.length,
      confirmed: file.confirmed.length,
      candidates: file.candidates.length,
      byRule: [...byRule.values()],
    },
    findings: file.findings.map((finding) => ({
      fingerprint: finding.fingerprint,
      ruleId: finding.ruleId,
      identity: finding.identity,
      severity: finding.severity,
      confidence: finding.confidence,
      detectionMode: finding.detectionMode,
      status: finding.status,
      evidence: finding.evidence,
      locations: finding.locations,
    })),
  };
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
