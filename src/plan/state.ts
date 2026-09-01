import type { FindingReview } from "../review/types.js";
import type { CleanupNode } from "./types.js";

export function nodeState(
  fingerprints: string[],
  prerequisiteCount: number,
  needsReview: ReadonlySet<string>,
  deferred: ReadonlySet<string> = new Set(),
): CleanupNode["state"] {
  if (fingerprints.some((fingerprint) => needsReview.has(fingerprint))) {
    return "needs_review";
  }
  if (fingerprints.length > 0 && fingerprints.every((fingerprint) => deferred.has(fingerprint))) {
    return "deferred";
  }
  if (fingerprints.some((fingerprint) => deferred.has(fingerprint))) {
    return "needs_review";
  }
  return prerequisiteCount === 0 ? "ready" : "blocked";
}

export function deferralFields(
  fingerprints: string[],
  reviewsByFingerprint: ReadonlyMap<string, FindingReview>,
): Pick<CleanupNode, "deferralReason" | "reconsiderWhen" | "missingEvidence"> {
  const reviews = fingerprints
    .map((fingerprint) => reviewsByFingerprint.get(fingerprint))
    .filter((review): review is FindingReview => review?.decision === "deferred");
  const first = reviews[0];
  if (!first) return {};
  return {
    ...(first.reason ? { deferralReason: first.reason } : {}),
    ...(first.reconsiderWhen ? { reconsiderWhen: first.reconsiderWhen } : {}),
    ...(first.missingEvidence ? { missingEvidence: first.missingEvidence } : {}),
  };
}
