import type { RuleId } from "../catalog/types.js";
import type {
  FindingReview,
  ReviewDecision,
  ReviewLifecycle,
} from "./types.js";

export type ReviewLifecycleState = "current" | "missing" | "expired";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
const PHASE_ONLY = /\bphase\s*\d+\b/i;
const ARCHITECTURE_ONLY = /architecture (document|doc|md|file) requires|the architecture (document|requires this layer)/i;
const SUBSTANCE = /\b(consumer|caller|invariant|boundary|behavior|behaviour|import|port|adapter)\b/i;

export function isReviewExpiry(value: string): boolean {
  if (!ISO_DATE.test(value) && !ISO_TIMESTAMP.test(value)) return false;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return false;
  return !ISO_DATE.test(value) || new Date(parsed).toISOString().slice(0, 10) === value;
}

export function requiresCompatibilityLifecycle(
  ruleId: RuleId,
  decision: ReviewDecision,
): boolean {
  return ruleId === "A07" && (decision === "dismissed" || decision === "deferred");
}

export function validateReviewLifecycle(
  ruleId: RuleId,
  decision: ReviewDecision,
  lifecycle: ReviewLifecycle,
  now = Date.now(),
): void {
  if (
    lifecycle.removalMilestone !== undefined &&
    !lifecycle.removalMilestone.trim()
  ) {
    throw new Error("Review removalMilestone must be a non-empty string.");
  }
  const hasLifecycle = Boolean(lifecycle.expiresAt || lifecycle.removalMilestone);
  const notCompatibility = lifecycle.notCompatibility === true;
  if (ruleId !== "A07" && (hasLifecycle || notCompatibility)) {
    throw new Error("Compatibility review metadata is only valid for A07 findings.");
  }
  if (notCompatibility && hasLifecycle) {
    throw new Error("A review cannot be both notCompatibility and lifecycle-bound.");
  }
  if (notCompatibility && decision !== "dismissed") {
    throw new Error("notCompatibility is only valid when dismissing an A07 signal.");
  }
  if (lifecycle.expiresAt) {
    if (!isReviewExpiry(lifecycle.expiresAt)) {
      throw new Error("Review expiresAt must be an ISO date or timestamp.");
    }
    const expires = Date.parse(lifecycle.expiresAt);
    if (expires <= now) {
      throw new Error("Review expiresAt must be in the future.");
    }
  }
  if (
    requiresCompatibilityLifecycle(ruleId, decision) &&
    !hasLifecycle &&
    !notCompatibility
  ) {
    throw new Error(
      "Dismissed or deferred A07 reviews require expiresAt or removalMilestone; use notCompatibility only for a reviewed false positive.",
    );
  }
  if (decision === "deferred") {
    validateDeferralConditions(lifecycle);
  }
}

export function validateDeferralConditions(lifecycle: ReviewLifecycle): void {
  if (
    lifecycle.missingEvidence?.trim() ||
    lifecycle.reconsiderWhen?.trim() ||
    lifecycle.expiresAt ||
    lifecycle.removalMilestone
  ) {
    return;
  }
  throw new Error(
    "Deferred reviews require missingEvidence or reconsiderWhen (or an A07 lifecycle). Cleanup phases are tie-breakers, not blockers.",
  );
}

export function validateReviewReason(decision: ReviewDecision, reason: string): void {
  const text = reason.trim();
  if (decision === "deferred" && PHASE_ONLY.test(text) && !SUBSTANCE.test(text)) {
    throw new Error(
      "A phase number is not a deferral condition. Record missing evidence or a prerequisite and when to reconsider.",
    );
  }
  if (
    (decision === "confirmed" || decision === "dismissed") &&
    ARCHITECTURE_ONLY.test(text) &&
    !SUBSTANCE.test(text)
  ) {
    throw new Error(
      "Citing the architecture document is context, not proof. Name the boundary, invariant, consumer, or behavioral distinction.",
    );
  }
}

export function reviewLifecycleState(
  review: FindingReview,
  now = Date.now(),
): ReviewLifecycleState {
  if (!requiresCompatibilityLifecycle(review.ruleId, review.decision)) return "current";
  if (review.decision === "dismissed" && review.notCompatibility) return "current";
  if (!review.expiresAt && !review.removalMilestone) return "missing";
  if (
    review.expiresAt &&
    (!isReviewExpiry(review.expiresAt) || Date.parse(review.expiresAt) <= now)
  ) return "expired";
  return "current";
}
