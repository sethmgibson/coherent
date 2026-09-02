import { runAudit, type AuditResult } from "../audit/run.js";
import { PORTABLE_ROOT } from "../config.js";
import type { Finding } from "../domain/finding.js";
import { applyReviews, matchReview } from "../review/apply.js";
import { readDecisions } from "../review/store.js";
import type { DecisionsFile, FindingReview } from "../review/types.js";
import { buildPlan } from "./build.js";
import type { CleanupPlan, PlanReviewSummary } from "./types.js";
import { isAdvisoryRule } from "../catalog/rules.js";

export interface PlanResult {
  plan: CleanupPlan;
  findingCount: number;
  findings: Finding[];
}

export interface PlanOptions {
  includeAdvisory?: boolean;
}

export async function runPlan(
  root: string,
  options: PlanOptions = {},
): Promise<PlanResult> {
  const [audit, decisions] = await Promise.all([
    runAudit(root),
    readDecisions(root),
  ]);
  return planFromAudit(audit, decisions, options);
}

export function planFromAudit(
  audit: AuditResult,
  decisions: DecisionsFile,
  options: PlanOptions = {},
): PlanResult {
  const sourceFindings = [...audit.findings, ...decisions.findings];
  const advisory = sourceFindings.filter((finding) => isAdvisoryRule(finding.ruleId));
  const includedAudit = options.includeAdvisory
    ? audit.findings
    : audit.findings.filter((finding) => !isAdvisoryRule(finding.ruleId));
  const includedSemantic = options.includeAdvisory
    ? decisions.findings
    : decisions.findings.filter((finding) => !isAdvisoryRule(finding.ruleId));
  const merged = applyReviews(includedAudit, decisions.reviews, includedSemantic);
  const plan = buildPlan(PORTABLE_ROOT, merged.findings, {
    ...merged,
    reviews: decisions.reviews,
  });
  plan.advisoryFindingCount = options.includeAdvisory ? 0 : advisory.length;
  plan.reviewSummary = reviewSummary(
    sourceFindings,
    decisions.reviews,
    merged.needsReview,
    merged.deferred,
    plan.nodes.length,
    options.includeAdvisory ? 0 : advisory.length,
  );
  return { plan, findingCount: merged.findings.length, findings: merged.findings };
}

function reviewSummary(
  sourceFindings: Finding[],
  reviews: FindingReview[],
  needsReview: ReadonlySet<string>,
  deferred: ReadonlySet<string>,
  cleanupNodes: number,
  advisory: number,
): PlanReviewSummary {
  const findings = [...new Map(sourceFindings.map((finding) => [finding.fingerprint, finding])).values()];
  let dismissed = 0;
  let confirmed = 0;
  let deferredCount = 0;
  for (const finding of findings) {
    const decision = matchReview(finding, reviews, findings)?.decision;
    if (decision === "dismissed") dismissed += 1;
    if (decision === "confirmed") confirmed += 1;
    if (decision === "deferred") deferredCount += 1;
  }
  return {
    detected: findings.length,
    dismissed,
    confirmed,
    deferred: deferredCount,
    advisory,
    awaitingReview: [...needsReview].filter((fingerprint) => !deferred.has(fingerprint)).length,
    cleanupNodes,
  };
}
