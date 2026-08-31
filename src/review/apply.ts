import { DETECTOR_REVISION } from "../config.js";
import type { Finding } from "../domain/finding.js";
import { reviewLifecycleState } from "./lifecycle.js";
import type { FindingReview, MergedFindings } from "./types.js";

export type ReviewMatch = "applied" | "stale" | "orphan";

export function applyReviews(
  mechanical: Finding[],
  reviews: FindingReview[],
  semantic: Finding[],
): MergedFindings {
  const findings: Finding[] = [];
  const deferred = new Set<string>();
  const needsReview = new Set<string>();
  const seen = new Set<string>();

  for (const finding of [...mechanical, ...semantic]) {
    if (seen.has(finding.fingerprint)) continue;
    const review = matchReview(finding, reviews);
    if (review?.decision === "dismissed") {
      seen.add(finding.fingerprint);
      continue;
    }
    const next = review?.decision === "confirmed" ? applyConfirm(finding, review) : finding;
    seen.add(next.fingerprint);
    findings.push(next);
    if (review?.decision === "deferred") {
      deferred.add(next.fingerprint);
      needsReview.add(next.fingerprint);
    } else if (requiresAgentReview(next) && review?.decision !== "confirmed") {
      needsReview.add(next.fingerprint);
    }
  }

  return { findings, deferred, needsReview };
}

export function matchReview(
  finding: Finding,
  reviews: FindingReview[],
): FindingReview | undefined {
  const exact = reviews.find((review) => review.fingerprint === finding.fingerprint);
  if (exact) {
    return reviewApplies(finding, exact) ? exact : undefined;
  }
  return reviews.find(
    (review) =>
      sameIdentity(review, finding) &&
      hasCurrentDetectorRevision(review) &&
      reviewLifecycleState(review) === "current",
  );
}

export function hasCurrentDetectorRevision(review: FindingReview): boolean {
  return review.detectorRevision === DETECTOR_REVISION;
}

export function classifyReview(review: FindingReview, findings: Finding[]): ReviewMatch {
  let staleIdentity = false;
  for (const finding of findings) {
    if (review.fingerprint === finding.fingerprint) {
      return reviewApplies(finding, review) ? "applied" : "stale";
    }
    if (sameIdentity(review, finding)) {
      if (
        hasCurrentDetectorRevision(review) &&
        reviewLifecycleState(review) === "current"
      ) return "applied";
      staleIdentity = true;
    }
  }
  return staleIdentity ? "stale" : "orphan";
}

function reviewApplies(finding: Finding, review: FindingReview): boolean {
  if (reviewLifecycleState(review) !== "current") return false;
  return finding.detectionMode === "semantic" || hasCurrentDetectorRevision(review);
}

function sameIdentity(review: FindingReview, finding: Finding): boolean {
  return review.ruleId === finding.ruleId && review.identity === finding.identity;
}

export function requiresAgentReview(finding: Finding): boolean {
  return finding.status === "candidate" || finding.detectionMode !== "deterministic";
}

function applyConfirm(finding: Finding, review: FindingReview): Finding {
  return {
    ...finding,
    status: "confirmed",
    ...(review.semanticEquivalence
      ? { semanticEquivalence: review.semanticEquivalence }
      : {}),
    ...(review.authoritativeConcept
      ? { authoritativeConcept: review.authoritativeConcept }
      : {}),
  };
}
