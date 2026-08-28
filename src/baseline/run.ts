import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runAudit, type AuditResult } from "../audit/run.js";
import { BACKEND_DIR, BASELINE_FILE } from "../config.js";
import type { DetectionMode, RuleId } from "../catalog/types.js";
import type { Finding, FindingStatus, Severity } from "../domain/finding.js";

export interface BaselineEntry {
  fingerprint: string;
  ruleId: RuleId;
  identity: string;
  title: string;
  detectionMode: DetectionMode;
  status: FindingStatus;
  severity: Severity;
  files: string[];
  symbols: string[];
}

export interface BaselineFile {
  createdAt: string;
  root: string;
  findings: BaselineEntry[];
}

export function baselinePath(root: string): string {
  return join(root, BACKEND_DIR, BASELINE_FILE);
}

export function toBaselineEntry(finding: Finding): BaselineEntry {
  return {
    fingerprint: finding.fingerprint,
    ruleId: finding.ruleId,
    identity: finding.identity,
    title: finding.title,
    detectionMode: finding.detectionMode,
    status: finding.status,
    severity: finding.severity,
    files: [...new Set(finding.locations.map((location) => location.file))].sort(),
    symbols: [...finding.affectedSymbols].sort(),
  };
}

export async function runBaseline(root: string): Promise<{
  audit: AuditResult;
  baselinePath: string;
  baseline: BaselineFile;
}> {
  const audit = await runAudit(root);
  const baseline: BaselineFile = {
    createdAt: new Date().toISOString(),
    root,
    findings: audit.findings.map(toBaselineEntry),
  };
  const path = baselinePath(root);
  await mkdir(join(root, BACKEND_DIR), { recursive: true });
  await writeFile(path, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
  return { audit, baselinePath: path, baseline };
}
