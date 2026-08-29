import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runAudit } from "../audit/run.js";
import { baselinePath, isBaselineStale, type BaselineFile } from "../baseline/run.js";
import { DETECTOR_REVISION, FINGERPRINT_VERSION } from "../config.js";
import type { Finding } from "../domain/finding.js";
import { classifyReview } from "./apply.js";
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

export interface ReviewPruneResult {
  removable: FindingReview[];
  retained: FindingReview[];
  decisionsPath: string;
  wrote: boolean;
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

export async function runReviewPrune(
  root: string,
  write = false,
): Promise<ReviewPruneResult> {
  const resolved = resolve(root);
  const [audit, decisions, baselineFingerprints] = await Promise.all([
    runAudit(resolved),
    readDecisions(resolved),
    currentBaselineFingerprints(resolved),
  ]);
  const known = [...audit.findings, ...decisions.findings];
  const removable: FindingReview[] = [];
  const retained: FindingReview[] = [];
  for (const review of decisions.reviews) {
    const match = classifyReview(review, known);
    const resolvedHistory = match === "orphan" && baselineFingerprints.has(review.fingerprint);
    if (match === "applied" || resolvedHistory) retained.push(review);
    else removable.push(review);
  }
  if (write && removable.length > 0) {
    await writeDecisions(resolved, { ...decisions, reviews: retained });
  }
  return {
    removable,
    retained,
    decisionsPath: decisionsPath(resolved),
    wrote: write && removable.length > 0,
  };
}

export function parseReviewRequests(raw: unknown): ReviewRequest[] {
  if (!Array.isArray(raw)) throw new Error("Review batch input must be a JSON array.");
  return raw.flatMap((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`Review batch item ${index + 1} must be an object.`);
    }
    const record = item as Record<string, unknown>;
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
    return fingerprints.map((fingerprint) => ({
      fingerprint,
      decision: record.decision as ReviewDecision,
      reason,
    }));
  });
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

async function currentBaselineFingerprints(root: string): Promise<Set<string>> {
  try {
    const baseline = JSON.parse(await readFile(baselinePath(root), "utf8")) as BaselineFile;
    if (!baseline || !Array.isArray(baseline.findings) || isBaselineStale(baseline)) {
      return new Set();
    }
    return new Set(baseline.findings.map((finding) => finding.fingerprint));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Set();
    throw error;
  }
}
