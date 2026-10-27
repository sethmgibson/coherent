import { detectorRevisionForRule } from "../config.js";
import type { Finding } from "../domain/finding.js";
import { reviewLifecycleState } from "./lifecycle.js";
import type { FindingReview } from "./types.js";

export type ReviewMatch = "applied" | "stale" | "orphan";
export type AppliedReviewKind = "exact" | "identity";

export interface AppliedFindingReview {
  review: FindingReview;
  kind: AppliedReviewKind;
}

export function matchReview(
  finding: Finding,
  reviews: FindingReview[],
  peers: readonly Finding[] = [],
): FindingReview | undefined {
  return matchReviewDetails(finding, reviews, peers)?.review;
}

export function matchReviewDetails(
  finding: Finding,
  reviews: FindingReview[],
  peers: readonly Finding[] = [],
  options: { allowIdentityFallback?: boolean } = {},
): AppliedFindingReview | undefined {
  const exact = reviews.find((review) => review.fingerprint === finding.fingerprint);
  if (exact) {
    return reviewApplies(finding, exact) ? { review: exact, kind: "exact" } : undefined;
  }
  if (options.allowIdentityFallback === false) return undefined;
  const fallback = reviews.filter(
    (review) =>
      sameIdentity(review, finding) &&
      hasCurrentDetectorRevision(review) &&
      reviewApplies(finding, review),
  );
  if (fallback.length !== 1) return undefined;
  if (ambiguousIdentity(finding, peers)) return undefined;
  return { review: fallback[0]!, kind: "identity" };
}

export function hasPotentialIdentityReview(
  finding: Finding,
  reviews: FindingReview[],
): boolean {
  return reviews.some(
    (review) =>
      sameIdentity(review, finding) &&
      hasCurrentDetectorRevision(review) &&
      reviewApplies(finding, review),
  );
}

export function hasCurrentDetectorRevision(review: FindingReview): boolean {
  const expected = detectorRevisionForRule(review.ruleId);
  return review.ruleDetectorRevision !== undefined
    ? review.ruleDetectorRevision === expected
    : review.detectorRevision === expected;
}

export function classifyReview(review: FindingReview, findings: Finding[]): ReviewMatch {
  let staleIdentity = false;
  let identityHits = 0;
  for (const finding of findings) {
    if (review.fingerprint === finding.fingerprint) {
      return reviewApplies(finding, review) ? "applied" : "stale";
    }
    if (sameIdentity(review, finding)) {
      identityHits += 1;
      staleIdentity = true;
    }
  }
  if (identityHits > 1) return "stale";
  if (
    identityHits === 1 &&
    hasCurrentDetectorRevision(review) &&
    reviewApplies(findings.find(finding => sameIdentity(review, finding))!, review)
  ) {
    return "applied";
  }
  return staleIdentity ? "stale" : "orphan";
}

function reviewApplies(finding: Finding, review: FindingReview): boolean {
  if (reviewLifecycleState(review) !== "current") return false;
  if (finding.detectionMode === "semantic") return true;
  if (finding.evidenceHash && finding.evidenceHash !== review.evidenceHash) return false;
  return hasCurrentDetectorRevision(review);
}

function sameIdentity(review: FindingReview, finding: Finding): boolean {
  return review.ruleId === finding.ruleId && review.identity === finding.identity;
}

function ambiguousIdentity(finding: Finding, peers: readonly Finding[]): boolean {
  return peers.filter(
    (peer) => peer.ruleId === finding.ruleId && peer.identity === finding.identity,
  ).length > 1;
}

export function requiresAgentReview(finding: Finding): boolean {
  return finding.status === "candidate" || finding.detectionMode !== "deterministic";
}

export type FindingReviewState = "unreviewed" | "deferred" | "ready" | "dismissed";

export function findingReviewState(
  finding: Finding,
  review: FindingReview | undefined,
): FindingReviewState {
  if (review?.decision === "dismissed") return "dismissed";
  if (review?.decision === "deferred") return "deferred";
  if (review?.decision === "confirmed" || !requiresAgentReview(finding)) return "ready";
  return "unreviewed";
}
