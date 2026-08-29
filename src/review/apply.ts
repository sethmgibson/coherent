import type { Finding } from "../domain/finding.js";
import type { FindingReview, MergedFindings } from "./types.js";

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
  return (
    reviews.find((review) => review.fingerprint === finding.fingerprint) ??
    reviews.find(
      (review) => review.ruleId === finding.ruleId && review.identity === finding.identity,
    )
  );
}

export function requiresAgentReview(finding: Finding): boolean {
  return finding.detectionMode !== "deterministic";
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
