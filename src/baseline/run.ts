import { mkdir, readFile, writeFile } from "node:fs/promises";
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
  wroteBaseline: boolean;
}> {
  const path = baselinePath(root);
  const [audit, existing] = await Promise.all([
    runAudit(root),
    readExistingBaseline(path),
  ]);
  const next: BaselineFile = {
    ...artifactVersions(),
    createdAt: new Date().toISOString(),
    findings: audit.findings.map(toBaselineEntry),
  };
  if (existing && equivalentBaseline(existing, next)) {
    return { audit, baselinePath: path, baseline: existing, wroteBaseline: false };
  }
  await mkdir(resolveStateDir(root).path, { recursive: true });
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return { audit, baselinePath: path, baseline: next, wroteBaseline: true };
}

async function readExistingBaseline(path: string): Promise<BaselineFile | undefined> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const raw = JSON.parse(text) as BaselineFile;
  return raw && Array.isArray(raw.findings) ? raw : undefined;
}

function equivalentBaseline(left: BaselineFile, right: BaselineFile): boolean {
  const withoutTime = (baseline: BaselineFile) => ({
    ...baseline,
    createdAt: undefined,
  });
  return JSON.stringify(withoutTime(left)) === JSON.stringify(withoutTime(right));
}
