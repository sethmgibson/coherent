import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runAudit, type AuditResult } from "../audit/run.js";
import { artifactVersions, BASELINE_FILE } from "../config.js";
import { resolveStateDir } from "../state-dir.js";
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
  schemaVersion: number;
  coherentVersion: string;
  fingerprintVersion: number;
  detectorRevision: number;
  createdAt: string;
  findings: BaselineEntry[];
  root?: string;
}

export function baselinePath(root: string): string {
  return join(resolveStateDir(root).path, BASELINE_FILE);
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

export function isBaselineStale(baseline: BaselineFile): boolean {
  const expected = artifactVersions();
  return (
    baseline.schemaVersion !== expected.schemaVersion ||
    baseline.fingerprintVersion !== expected.fingerprintVersion ||
    baseline.detectorRevision !== expected.detectorRevision
  );
}

export async function runBaseline(root: string): Promise<{
  audit: AuditResult;
  baselinePath: string;
  baseline: BaselineFile;
}> {
  const audit = await runAudit(root);
  const baseline: BaselineFile = {
    ...artifactVersions(),
    createdAt: new Date().toISOString(),
    findings: audit.findings.map(toBaselineEntry),
  };
  const path = baselinePath(root);
  await mkdir(resolveStateDir(root).path, { recursive: true });
  await writeFile(path, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
  return { audit, baselinePath: path, baseline };
}
