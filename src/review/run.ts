import { resolve } from "node:path";
import { runAudit } from "../audit/run.js";
import { DETECTOR_REVISION, FINGERPRINT_VERSION } from "../config.js";
import type { Finding } from "../domain/finding.js";
import { decisionsPath, readDecisions, writeDecisions } from "./store.js";
import {
  REVIEW_DECISIONS,
  type FindingReview,
  type ReviewDecision,
} from "./types.js";

export interface ReviewRequest {
  fingerprint: string;
  decision: ReviewDecision;
  reason: string;
}

export interface ReviewResult {
  review: FindingReview;
  decisionsPath: string;
}

export interface ReviewBatchResult {
  reviews: FindingReview[];
  decisionsPath: string;
}

export async function runReview(
  root: string,
  decision: ReviewDecision,
  fingerprint: string,
  reason: string,
): Promise<ReviewResult> {
  const result = await runReviewBatch(root, [{ fingerprint, decision, reason }]);
  return { review: result.reviews[0]!, decisionsPath: result.decisionsPath };
}

export async function runReviewBatch(
  root: string,
  requests: ReviewRequest[],
): Promise<ReviewBatchResult> {
  if (requests.length === 0) throw new Error("Review batch must contain at least one decision.");
  const resolved = resolve(root);
  const [audit, decisions] = await Promise.all([runAudit(resolved), readDecisions(resolved)]);
  const findings = [...audit.findings, ...decisions.findings];
  const reviews: FindingReview[] = [];
  const seenFingerprints = new Set<string>();
  const seenIdentities = new Set<string>();

  for (const request of requests) {
    const finding = resolveFinding(findings, request.fingerprint);
    if (!finding) {
      throw new Error(
        `No finding with fingerprint ${request.fingerprint}. Run \`coherent audit\` first, or add the semantic finding to decisions.json.`,
      );
    }
    const identityKey = `${finding.ruleId}\u0000${finding.identity}`;
    if (seenFingerprints.has(finding.fingerprint) || seenIdentities.has(identityKey)) {
      throw new Error(`Review batch contains the same finding more than once: ${request.fingerprint}.`);
    }
    seenFingerprints.add(finding.fingerprint);
    seenIdentities.add(identityKey);
    reviews.push(toReview(finding, request));
  }

  const replacedFingerprints = new Set(reviews.map((review) => review.fingerprint));
  const replacedIdentities = new Set(
    reviews.map((review) => `${review.ruleId}\u0000${review.identity}`),
  );
  const retained = decisions.reviews.filter(
    (review) =>
      !replacedFingerprints.has(review.fingerprint) &&
      !replacedIdentities.has(`${review.ruleId}\u0000${review.identity}`),
  );
  await writeDecisions(resolved, {
    ...decisions,
    reviews: [...retained, ...reviews],
  });
  return { reviews, decisionsPath: decisionsPath(resolved) };
}

export function parseReviewRequests(raw: unknown): ReviewRequest[] {
  if (!Array.isArray(raw)) throw new Error("Review batch input must be a JSON array.");
  return raw.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`Review batch item ${index + 1} must be an object.`);
    }
    const record = item as Record<string, unknown>;
    if (typeof record.fingerprint !== "string" || !record.fingerprint.trim()) {
      throw new Error(`Review batch item ${index + 1} is missing fingerprint.`);
    }
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
    return {
      fingerprint: record.fingerprint.trim(),
      decision: record.decision as ReviewDecision,
      reason: record.reason.trim(),
    };
  });
}

function resolveFinding(findings: Finding[], fingerprint: string): Finding | undefined {
  const exact = findings.find((finding) => finding.fingerprint === fingerprint);
  if (exact) return exact;
  const prefixMatches = findings.filter((finding) => finding.fingerprint.startsWith(fingerprint));
  if (prefixMatches.length === 1) return prefixMatches[0];
  if (prefixMatches.length > 1) {
    throw new Error(`Finding fingerprint prefix ${fingerprint} is ambiguous.`);
  }
  return undefined;
}

function toReview(finding: Finding, request: ReviewRequest): FindingReview {
  return {
    fingerprint: finding.fingerprint,
    ruleId: finding.ruleId,
    identity: finding.identity,
    decision: request.decision,
    reason: request.reason,
    reviewedAt: new Date().toISOString(),
    fingerprintVersion: FINGERPRINT_VERSION,
    detectorRevision: DETECTOR_REVISION,
    ...(finding.semanticEquivalence
      ? { semanticEquivalence: finding.semanticEquivalence }
      : {}),
    ...(finding.authoritativeConcept
      ? { authoritativeConcept: finding.authoritativeConcept }
      : {}),
  };
}
