import { isReviewExpiry } from "./lifecycle.js";
import { REVIEW_DECISIONS, type ReviewDecision, type ReviewLifecycle } from "./types.js";

export interface ReviewRequest extends ReviewLifecycle {
  fingerprint: string;
  decision: ReviewDecision;
  reason: string;
  semanticEquivalence?: string;
  authoritativeConcept?: string;
}

const BATCH_FIELDS = new Set([
  "fingerprint",
  "fingerprints",
  "decision",
  "reason",
  "expiresAt",
  "removalMilestone",
  "notCompatibility",
  "semanticEquivalence",
  "authoritativeConcept",
  "missingEvidence",
  "reconsiderWhen",
]);

export function parseReviewRequests(raw: unknown): ReviewRequest[] {
  if (!Array.isArray(raw)) throw new Error("Review batch input must be a JSON array.");
  return raw.flatMap((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`Review batch item ${index + 1} must be an object.`);
    }
    const record = item as Record<string, unknown>;
    rejectUnknownFields(record, index);
    const fingerprints = reviewFingerprints(record, index);
    if (
      typeof record.decision !== "string" ||
      !(REVIEW_DECISIONS as readonly string[]).includes(record.decision)
    ) {
      throw new Error(
        `Review batch item ${index + 1} decision must be ${REVIEW_DECISIONS.join(", ")}.`,
      );
    }
    if (typeof record.reason !== "string" || !record.reason.trim()) {
      throw new Error(`Review batch item ${index + 1} is missing reason.`);
    }
    const reason = record.reason.trim();
    const expiresAt = reviewText(record.expiresAt, "expiresAt", index);
    if (expiresAt && !isReviewExpiry(expiresAt)) {
      throw new Error(
        `Review batch item ${index + 1} expiresAt must be an ISO date or timestamp.`,
      );
    }
    const removalMilestone = reviewText(record.removalMilestone, "removalMilestone", index);
    if (record.notCompatibility !== undefined && record.notCompatibility !== true) {
      throw new Error(
        `Review batch item ${index + 1} notCompatibility must be true when present.`,
      );
    }
    return fingerprints.map((fingerprint) => ({
      fingerprint,
      decision: record.decision as ReviewDecision,
      reason,
      ...(expiresAt ? { expiresAt } : {}),
      ...(removalMilestone ? { removalMilestone } : {}),
      ...(record.notCompatibility === true ? { notCompatibility: true as const } : {}),
      ...optionalReviewText(record, "semanticEquivalence", index),
      ...optionalReviewText(record, "authoritativeConcept", index),
      ...optionalReviewText(record, "missingEvidence", index),
      ...optionalReviewText(record, "reconsiderWhen", index),
    }));
  });
}

function rejectUnknownFields(record: Record<string, unknown>, index: number): void {
  const unknown = Object.keys(record).filter((key) => !BATCH_FIELDS.has(key));
  if (unknown.length > 0) {
    throw new Error(
      `Review batch item ${index + 1} has unknown field(s): ${unknown.join(", ")}.`,
    );
  }
}

function optionalReviewText(
  record: Record<string, unknown>,
  field: keyof ReviewRequest,
  index: number,
): Partial<Pick<ReviewRequest, typeof field>> {
  const value = reviewText(record[field], field, index);
  return value ? { [field]: value } : {};
}

function reviewText(
  value: unknown,
  field: string,
  index: number,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Review batch item ${index + 1} ${field} must be a non-empty string.`);
  }
  return value.trim();
}

function reviewFingerprints(record: Record<string, unknown>, index: number): string[] {
  const single = typeof record.fingerprint === "string" && record.fingerprint.trim()
    ? [record.fingerprint.trim()]
    : [];
  const grouped = Array.isArray(record.fingerprints)
    ? record.fingerprints.map((value) => typeof value === "string" ? value.trim() : "")
    : [];
  if (single.length > 0 && grouped.length > 0) {
    throw new Error(`Review batch item ${index + 1} must use fingerprint or fingerprints, not both.`);
  }
  const fingerprints = single.length > 0 ? single : grouped;
  if (fingerprints.length === 0 || fingerprints.some((value) => !value)) {
    throw new Error(`Review batch item ${index + 1} is missing fingerprint or fingerprints.`);
  }
  return fingerprints;
}
