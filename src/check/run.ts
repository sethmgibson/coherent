import { readFile } from "node:fs/promises";
import { runAudit, type AuditResult } from "../audit/run.js";
import { baselinePath, type BaselineEntry, type BaselineFile, toBaselineEntry } from "../baseline/run.js";
import type { Finding } from "../domain/finding.js";
import { classifyNewDebt, conceptualHardness, type NewDebt } from "./prevention.js";

export type DriftKind = "NEW" | "EXISTING" | "RESOLVED";

export type DriftItem = BaselineEntry & { kind: DriftKind };

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
}

export async function runCheck(root: string): Promise<CheckResult> {
  const baseline = await readBaseline(root);
  if (!baseline) {
    throw new Error(
      `No baseline at ${baselinePath(root)}. Run \`coherent baseline\` first.`,
    );
  }
  const audit = await runAudit(root);
  const baseByFp = new Map(baseline.findings.map((entry) => [entry.fingerprint, entry]));
  const auditByFp = new Map(audit.findings.map((finding) => [finding.fingerprint, finding]));

  const newFindings: DriftItem[] = [];
  const existingFindings: DriftItem[] = [];
  const resolvedFindings: DriftItem[] = [];

  for (const finding of audit.findings) {
    const item = itemFromFinding(finding, baseByFp.has(finding.fingerprint) ? "EXISTING" : "NEW");
    if (item.kind === "NEW") newFindings.push(item);
    else existingFindings.push(item);
  }
  for (const entry of baseline.findings) {
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
  };
}

export function renderCheck(result: CheckResult): string {
  const lines = [
    "Coherent check",
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
