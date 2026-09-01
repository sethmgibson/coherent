import { runAudit, type AuditResult } from "../audit/run.js";
import {
  baselinePath,
  isBaselineStale,
  readBaseline,
  type BaselineEntry,
  type BaselineFile,
  toBaselineEntry,
} from "../baseline/run.js";
import { RULES_BY_ID } from "../catalog/rules.js";
import { loadConfig } from "../config.js";
import type { Finding } from "../domain/finding.js";
import { listChangedSourceFiles } from "./changed-files.js";
import { expandWithImporters } from "./importers.js";
import { classifyNewDebt, conceptualHardness, type NewDebt } from "./prevention.js";
import {
  findingReviewState,
  hasPotentialIdentityReview,
  matchReviewDetails,
  type AppliedReviewKind,
  type FindingReviewState,
} from "../review/apply.js";
import { readDecisions } from "../review/store.js";
import type { ReviewDecision } from "../review/types.js";
import { portableRuntimeIdentity, renderRuntimeIdentity, type PortableRuntimeIdentity } from "../runtime.js";

export type DriftKind = "NEW" | "EXISTING" | "RESOLVED";

export type CheckReviewState = FindingReviewState | "requires_full_scan";

export type DriftItem = BaselineEntry & {
  kind: DriftKind;
  reviewState?: CheckReviewState;
  reviewDecision?: ReviewDecision;
  reviewMatch?: AppliedReviewKind;
  reviewReason?: string;
};

export interface CheckOptions {
  changed?: boolean;
}

export interface CheckResult {
  runtime: PortableRuntimeIdentity;
  audit: AuditResult;
  baseline: BaselineFile;
  newFindings: DriftItem[];
  existingFindings: DriftItem[];
  resolvedFindings: DriftItem[];
  failing: DriftItem[];
  newDebt: NewDebt<DriftItem>[];
  conceptualHardness: string;
  gateStatus: "passed" | "failed";
  driftStatus: "none" | "present";
  reviewSummary: Record<CheckReviewState, number>;
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
  const [audit, decisions] = await Promise.all([
    runAudit(root, include ? { include } : {}),
    readDecisions(root),
  ]);
  const peers = [...audit.findings, ...decisions.findings];
  const baseByFp = new Map(baseline.findings.map((entry) => [entry.fingerprint, entry]));
  const auditByFp = new Map(audit.findings.map((finding) => [finding.fingerprint, finding]));

  const newFindings: DriftItem[] = [];
  const existingFindings: DriftItem[] = [];
  const resolvedFindings: DriftItem[] = [];

  for (const finding of audit.findings) {
    const files = finding.locations.map((location) => location.file);
    if (!inScope(files, scope)) continue;
    const item = itemFromFinding(
      finding,
      baseByFp.has(finding.fingerprint) ? "EXISTING" : "NEW",
      decisions.reviews,
      peers,
      options.changed === true,
    );
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
  const reviewSummary = emptyReviewSummary();
  for (const item of newFindings) {
    reviewSummary[item.reviewState ?? "unreviewed"] += 1;
  }
  const exitCode = failing.length > 0 ? 1 : 0;

  return {
    runtime: portableRuntimeIdentity(),
    audit,
    baseline,
    newFindings,
    existingFindings,
    resolvedFindings,
    failing,
    newDebt,
    conceptualHardness: conceptualHardness(newFindings, newDebt),
    gateStatus: exitCode === 0 ? "passed" : "failed",
    driftStatus: newFindings.length === 0 && resolvedFindings.length === 0 ? "none" : "present",
    reviewSummary,
    exitCode,
    ...(scope ? { scopedFiles: [...scope].sort() } : {}),
  };
}

export function renderCheck(result: CheckResult): string {
  const lines = [
    "Coherent check",
    renderRuntimeIdentity(result.runtime),
    ...(result.scopedFiles
      ? [`scope: changed (${result.scopedFiles.length} file(s))`]
      : []),
    `Gate: ${result.gateStatus.toUpperCase()}  Drift: ${result.driftStatus.toUpperCase()}`,
    `NEW ${result.newFindings.length}  EXISTING ${result.existingFindings.length}  RESOLVED ${result.resolvedFindings.length}`,
    `NEW review state — Ready: ${result.reviewSummary.ready}  Unreviewed: ${result.reviewSummary.unreviewed}  Deferred: ${result.reviewSummary.deferred}  Dismissed: ${result.reviewSummary.dismissed}  Requires full scan: ${result.reviewSummary.requires_full_scan}`,
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
    lines.push(
      `Existing baseline signals: ${result.existingFindings.length} (does not fail the check).`,
    );
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
  lines.push(
    "Existing baseline signals do not fail the check. Hybrid and candidate findings are reported.",
  );
  return `${lines.join("\n")}\n`;
}

function formatItem(item: DriftItem): string {
  const where = item.files[0] ?? item.identity;
  const findingName = RULES_BY_ID[item.ruleId].title;
  const review = item.reviewState ? ` ${item.reviewState}` : "";
  const match = item.reviewMatch ? `/${item.reviewMatch}` : "";
  return `  [${item.kind}${review}${match}] ${findingName}: ${item.title} (${item.status} ${item.severity} ${item.detectionMode}) — ${where}`;
}

function itemFromFinding(
  finding: Finding,
  kind: DriftKind,
  reviews: Awaited<ReturnType<typeof readDecisions>>["reviews"],
  peers: readonly Finding[],
  scoped: boolean,
): DriftItem {
  const entry = toBaselineEntry(finding);
  const match = matchReviewDetails(finding, reviews, peers, {
    allowIdentityFallback: !scoped,
  });
  const requiresFullScan =
    scoped && !match && hasPotentialIdentityReview(finding, reviews);
  return {
    kind,
    ...entry,
    reviewState: requiresFullScan
      ? "requires_full_scan"
      : findingReviewState(finding, match?.review),
    ...(match?.review.decision ? { reviewDecision: match.review.decision } : {}),
    ...(match ? { reviewMatch: match.kind } : {}),
    ...(match?.review.reason ? { reviewReason: match.review.reason } : {}),
  };
}

function emptyReviewSummary(): Record<CheckReviewState, number> {
  return {
    ready: 0,
    unreviewed: 0,
    deferred: 0,
    dismissed: 0,
    requires_full_scan: 0,
  };
}

function inScope(files: string[], scope?: Set<string>): boolean {
  if (!scope) return true;
  return files.some((file) => scope.has(file));
}
