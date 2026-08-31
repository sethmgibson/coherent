import { runAudit, type AuditResult } from "../audit/run.js";
import { PORTABLE_ROOT } from "../config.js";
import type { Finding } from "../domain/finding.js";
import { applyReviews, matchReview } from "../review/apply.js";
import { readDecisions } from "../review/store.js";
import type { DecisionsFile, FindingReview } from "../review/types.js";
import { buildPlan } from "./build.js";
import type { CleanupPlan, PlanReviewSummary } from "./types.js";

export interface PlanResult {
  plan: CleanupPlan;
  findingCount: number;
  findings: Finding[];
}

export async function runPlan(root: string): Promise<PlanResult> {
  const [audit, decisions] = await Promise.all([
    runAudit(root),
    readDecisions(root),
  ]);
  return planFromAudit(audit, decisions);
}

export function planFromAudit(
  audit: AuditResult,
  decisions: DecisionsFile,
): PlanResult {
  const merged = applyReviews(audit.findings, decisions.reviews, decisions.findings);
  const plan = buildPlan(PORTABLE_ROOT, merged.findings, merged);
  plan.reviewSummary = reviewSummary(
    [...audit.findings, ...decisions.findings],
    decisions.reviews,
    merged.needsReview,
    merged.deferred,
    plan.nodes.length,
  );
  return { plan, findingCount: merged.findings.length, findings: merged.findings };
}

function reviewSummary(
  sourceFindings: Finding[],
  reviews: FindingReview[],
  needsReview: ReadonlySet<string>,
  deferred: ReadonlySet<string>,
  cleanupNodes: number,
): PlanReviewSummary {
  const findings = [...new Map(sourceFindings.map((finding) => [finding.fingerprint, finding])).values()];
  let dismissed = 0;
  let confirmed = 0;
  let deferredCount = 0;
  for (const finding of findings) {
    const decision = matchReview(finding, reviews)?.decision;
    if (decision === "dismissed") dismissed += 1;
    if (decision === "confirmed") confirmed += 1;
    if (decision === "deferred") deferredCount += 1;
  }
  return {
    detected: findings.length,
    dismissed,
    confirmed,
    deferred: deferredCount,
    awaitingReview: [...needsReview].filter((fingerprint) => !deferred.has(fingerprint)).length,
    cleanupNodes,
  };
}
