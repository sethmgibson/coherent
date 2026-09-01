import { DETECTOR_REVISION } from "../config.js";
import type { Finding } from "../domain/finding.js";
import { reviewLifecycleState } from "./lifecycle.js";
import type { FindingReview, MergedFindings } from "./types.js";

export type ReviewMatch = "applied" | "stale" | "orphan";
export type AppliedReviewKind = "exact" | "identity";

export interface AppliedFindingReview {
  review: FindingReview;
  kind: AppliedReviewKind;
}

export function applyReviews(
  mechanical: Finding[],
  reviews: FindingReview[],
  semantic: Finding[],
): MergedFindings {
  const findings: Finding[] = [];
  const deferred = new Set<string>();
  const needsReview = new Set<string>();
  const seen = new Set<string>();
  const peers = [...mechanical, ...semantic];

  for (const finding of peers) {
    if (seen.has(finding.fingerprint)) continue;
    const review = matchReview(finding, reviews, peers);
    if (review?.decision === "dismissed") {
      seen.add(finding.fingerprint);
      continue;
    }
    const next = review?.decision === "confirmed" ? applyConfirm(finding, review) : finding;
    seen.add(next.fingerprint);
    findings.push(next);
    if (review?.decision === "deferred") {
      deferred.add(next.fingerprint);
    } else if (requiresAgentReview(next) && review?.decision !== "confirmed") {
      needsReview.add(next.fingerprint);
    }
  }

  return { findings, deferred, needsReview };
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
      reviewLifecycleState(review) === "current",
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
      reviewLifecycleState(review) === "current",
  );
}

export function hasCurrentDetectorRevision(review: FindingReview): boolean {
  return review.detectorRevision === DETECTOR_REVISION;
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
    reviewLifecycleState(review) === "current"
  ) {
    return "applied";
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
