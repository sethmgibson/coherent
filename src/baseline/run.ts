import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runAudit, type AuditResult } from "../audit/run.js";
import { artifactVersions, BASELINE_FILE } from "../config.js";
import { resolveStateDir } from "../state-dir.js";
import {
  DETECTION_MODES,
  RULE_IDS,
  type DetectionMode,
  type RuleId,
} from "../catalog/types.js";
import {
  FINDING_STATUSES,
  SEVERITIES,
  type Finding,
  type FindingStatus,
  type Severity,
} from "../domain/finding.js";

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

export function parseBaselineFile(raw: unknown): BaselineFile {
  if (!isRecord(raw)) {
    throw new Error("Invalid baseline: expected an object");
  }
  if (!Array.isArray(raw.findings)) {
    throw new Error("Invalid baseline: findings must be an array");
  }
  const baseline: BaselineFile = {
    schemaVersion: requireInteger(raw.schemaVersion, "schemaVersion"),
    coherentVersion: requireNonEmptyString(raw.coherentVersion, "coherentVersion"),
    fingerprintVersion: requireInteger(raw.fingerprintVersion, "fingerprintVersion"),
    detectorRevision: requireInteger(raw.detectorRevision, "detectorRevision"),
    createdAt: requireNonEmptyString(raw.createdAt, "createdAt"),
    findings: raw.findings.map(parseBaselineEntry),
  };
  if (raw.root !== undefined) {
    baseline.root = requireNonEmptyString(raw.root, "root");
  }
  return baseline;
}

export async function readBaseline(root: string): Promise<BaselineFile | undefined> {
  const path = baselinePath(root);
  try {
    return parseBaselineFile(JSON.parse(await readFile(path, "utf8")) as unknown);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid baseline at ${path}: ${message}`);
  }
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
    readBaseline(root),
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

function equivalentBaseline(left: BaselineFile, right: BaselineFile): boolean {
  const withoutTime = (baseline: BaselineFile) => ({
    ...baseline,
    createdAt: undefined,
  });
  return JSON.stringify(withoutTime(left)) === JSON.stringify(withoutTime(right));
}

function parseBaselineEntry(raw: unknown, index: number): BaselineEntry {
  if (!isRecord(raw)) {
    throw new Error(`Invalid baseline: findings[${index}] must be an object`);
  }
  const ruleId = raw.ruleId;
  if (typeof ruleId !== "string" || !(RULE_IDS as readonly string[]).includes(ruleId)) {
    throw new Error(`Invalid baseline: findings[${index}].ruleId is invalid`);
  }
  const detectionMode = raw.detectionMode;
  if (
    typeof detectionMode !== "string" ||
    !(DETECTION_MODES as readonly string[]).includes(detectionMode)
  ) {
    throw new Error(`Invalid baseline: findings[${index}].detectionMode is invalid`);
  }
  const status = raw.status;
  if (typeof status !== "string" || !(FINDING_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`Invalid baseline: findings[${index}].status is invalid`);
  }
  const severity = raw.severity;
  if (typeof severity !== "string" || !(SEVERITIES as readonly string[]).includes(severity)) {
    throw new Error(`Invalid baseline: findings[${index}].severity is invalid`);
  }
  return {
    fingerprint: requireNonEmptyString(raw.fingerprint, `findings[${index}].fingerprint`),
    ruleId: ruleId as RuleId,
    identity: requireNonEmptyString(raw.identity, `findings[${index}].identity`),
    title: requireString(raw.title, `findings[${index}].title`),
    detectionMode: detectionMode as DetectionMode,
    status: status as FindingStatus,
    severity: severity as Severity,
    files: requireStringArray(raw.files, `findings[${index}].files`),
    symbols: requireStringArray(raw.symbols, `findings[${index}].symbols`),
  };
}

function requireInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Invalid baseline: ${field} must be an integer`);
  }
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid baseline: ${field} must be a string`);
  }
  return value;
}

function requireNonEmptyString(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (!text) throw new Error(`Invalid baseline: ${field} must not be empty`);
  return text;
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Invalid baseline: ${field} must be an array of strings`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
