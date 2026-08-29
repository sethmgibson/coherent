import { readFile } from "node:fs/promises";
import { runAudit, type AuditResult } from "../audit/run.js";
import {
  baselinePath,
  isBaselineStale,
  type BaselineEntry,
  type BaselineFile,
  toBaselineEntry,
} from "../baseline/run.js";
import { loadConfig } from "../config.js";
import type { Finding } from "../domain/finding.js";
import { listChangedSourceFiles } from "./changed-files.js";
import { expandWithImporters } from "./importers.js";
import { classifyNewDebt, conceptualHardness, type NewDebt } from "./prevention.js";

export type DriftKind = "NEW" | "EXISTING" | "RESOLVED";

export type DriftItem = BaselineEntry & { kind: DriftKind };

export interface CheckOptions {
  changed?: boolean;
}

export interface CheckResult {
  audit: AuditResult;
  baseline: BaselineFile;
  newFindings: DriftItem[];
  existingFindings: DriftItem[];
  resolvedFindings: DriftItem[];
  failing: DriftItem[];
  newDebt: NewDebt<DriftItem>[];
  conceptualHardness: string;
  exitCode: number;
  scopedFiles?: string[];
}

export async function runCheck(
  root: string,
  options: CheckOptions = {},
): Promise<CheckResult> {
  const baseline = await readBaseline(root);
  if (!baseline) {
    throw new Error(
      `No baseline at ${baselinePath(root)}. Run \`coherent baseline\` first.`,
    );
  }
  if (isBaselineStale(baseline)) {
    throw new Error(
      `Baseline is stale (schema, fingerprint, or detector version mismatch). Re-run \`coherent baseline\`.`,
    );
  }
  let include: string[] | undefined;
  let scope: Set<string> | undefined;
  if (options.changed) {
    const listed = await listChangedSourceFiles(root);
    const config = await loadConfig(root);
    include = await expandWithImporters(root, listed.existing, config);
    scope = new Set([...include, ...listed.deleted]);
  }
  const audit = await runAudit(
    root,
    include ? { include, persist: false } : {},
  );
  const baseByFp = new Map(baseline.findings.map((entry) => [entry.fingerprint, entry]));
  const auditByFp = new Map(audit.findings.map((finding) => [finding.fingerprint, finding]));

  const newFindings: DriftItem[] = [];
  const existingFindings: DriftItem[] = [];
  const resolvedFindings: DriftItem[] = [];

  for (const finding of audit.findings) {
    const files = finding.locations.map((location) => location.file);
    if (!inScope(files, scope)) continue;
    const item = itemFromFinding(finding, baseByFp.has(finding.fingerprint) ? "EXISTING" : "NEW");
    if (item.kind === "NEW") newFindings.push(item);
    else existingFindings.push(item);
  }
  for (const entry of baseline.findings) {
    if (!inScope(entry.files, scope)) continue;
    if (!auditByFp.has(entry.fingerprint)) {
      resolvedFindings.push({
        kind: "RESOLVED",
        fingerprint: entry.fingerprint,
        ruleId: entry.ruleId,
        identity: entry.identity,
        title: entry.title,
        detectionMode: entry.detectionMode,
        status: entry.status,
        severity: entry.severity,
        files: entry.files,
        symbols: entry.symbols,
      });
    }
  }

  const failing = newFindings.filter(
    (item) =>
      item.detectionMode === "deterministic" &&
      item.status === "confirmed" &&
      (item.severity === "critical" || item.severity === "high"),
  );
  const newDebt = classifyNewDebt(newFindings);

  return {
    audit,
    baseline,
    newFindings,
    existingFindings,
    resolvedFindings,
    failing,
    newDebt,
    conceptualHardness: conceptualHardness(newFindings, newDebt),
    exitCode: failing.length > 0 ? 1 : 0,
    ...(scope ? { scopedFiles: [...scope].sort() } : {}),
  };
}

export function renderCheck(result: CheckResult): string {
  const lines = [
    "Coherent check",
    ...(result.scopedFiles
      ? [`scope: changed (${result.scopedFiles.length} file(s))`]
      : []),
    `NEW ${result.newFindings.length}  EXISTING ${result.existingFindings.length}  RESOLVED ${result.resolvedFindings.length}`,
    "",
  ];
  for (const item of result.newFindings) {
    lines.push(formatItem(item));
  }
  if (result.resolvedFindings.length > 0) {
    lines.push("");
    lines.push("Resolved:");
    for (const item of result.resolvedFindings) {
      lines.push(formatItem(item));
    }
  }
  if (result.existingFindings.length > 0) {
    lines.push("");
    lines.push(`Existing debt: ${result.existingFindings.length} (does not fail the check).`);
  }
  lines.push("");
  lines.push("Did this feature make the system conceptually harder to change?");
  lines.push(`  ${result.conceptualHardness}`);
  if (result.newDebt.length > 0) {
    lines.push("");
    lines.push("New architecture debt (inspect these; do not run a full legacy cleanup):");
    for (const group of result.newDebt) {
      lines.push(`  ${group.kind}: ${group.items.length}`);
    }
  }
  lines.push("");
  if (result.failing.length > 0) {
    lines.push(
      `Failing: ${result.failing.length} new confirmed high/critical deterministic finding(s).`,
    );
  } else {
    lines.push("No new confirmed high/critical deterministic findings.");
  }
  lines.push("Existing debt does not fail the check. Hybrid and candidate findings are reported.");
  return `${lines.join("\n")}\n`;
}

function formatItem(item: DriftItem): string {
  const where = item.files[0] ?? item.identity;
  return `  [${item.kind}] ${item.ruleId} ${item.title} (${item.status} ${item.severity} ${item.detectionMode}) — ${where}`;
}

function itemFromFinding(finding: Finding, kind: DriftKind): DriftItem {
  const entry = toBaselineEntry(finding);
  return { kind, ...entry };
}

function inScope(files: string[], scope?: Set<string>): boolean {
  if (!scope) return true;
  return files.some((file) => scope.has(file));
}

async function readBaseline(root: string): Promise<BaselineFile | undefined> {
  try {
    const raw = JSON.parse(await readFile(baselinePath(root), "utf8")) as BaselineFile;
    if (!raw || !Array.isArray(raw.findings)) return undefined;
    return raw;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
