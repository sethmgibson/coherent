import { resolve } from "node:path";
import { runAudit } from "../audit/run.js";
import { isBaselineStale, readBaseline, staleBaselineRuleIds } from "../baseline/run.js";
import {
  DETECTOR_REVISION,
  FINGERPRINT_VERSION,
  detectorRevisionForRule,
} from "../config.js";
import type { Finding } from "../domain/finding.js";
import { classifyReview } from "./apply.js";
import { reviewLifecycleState, validateReviewLifecycle, validateReviewReason } from "./lifecycle.js";
import type { ReviewRequest } from "./parse.js";
import { decisionsPath, readDecisions, updateDecisions } from "./store.js";
import type {
  FindingReview,
  ReviewApplyReceipt,
  ReviewDecision,
  ReviewLifecycle,
  ReviewReplacement,
} from "./types.js";
import { reviewGroupKey } from "./group.js";
import { portableRuntimeIdentity } from "../runtime.js";

export type { ReviewRequest } from "./parse.js";
export { parseReviewRequests } from "./parse.js";

export interface ReviewResult {
  review: FindingReview;
  decisionsPath: string;
  receipt: ReviewApplyReceipt;
}

export interface ReviewBatchResult {
  reviews: FindingReview[];
  decisionsPath: string;
  receipt: ReviewApplyReceipt;
}

export interface ReviewPruneResult {
  removable: FindingReview[];
  retained: FindingReview[];
  decisionsPath: string;
  wrote: boolean;
}

export interface ReviewWriteOptions {
  dryRun?: boolean;
}

export async function runReview(
  root: string,
  decision: ReviewDecision,
  fingerprint: string,
  reason: string,
  lifecycle: ReviewLifecycle = {},
  options: ReviewWriteOptions = {},
): Promise<ReviewResult> {
  const result = await runReviewBatch(
    root,
    [{ fingerprint, decision, reason, ...lifecycle }],
    options,
  );
  return {
    review: result.reviews[0]!,
    decisionsPath: result.decisionsPath,
    receipt: result.receipt,
  };
}

export async function runReviewBatch(
  root: string,
  requests: ReviewRequest[],
  options: ReviewWriteOptions = {},
): Promise<ReviewBatchResult> {
  if (requests.length === 0) throw new Error("Review batch must contain at least one decision.");
  const resolved = resolve(root);
  const audit = await runAudit(resolved);
  const path = decisionsPath(resolved);
  if (options.dryRun) {
    const decisions = await readDecisions(resolved);
    const prepared = prepareReviews(requests, [...audit.findings, ...decisions.findings], decisions.reviews);
    return {
      reviews: prepared.reviews,
      decisionsPath: path,
      receipt: toReceipt(prepared, path, true, false),
    };
  }
  let prepared!: PreparedReviews;
  const written = await updateDecisions(resolved, (decisions) => {
    prepared = prepareReviews(
      requests,
      [...audit.findings, ...decisions.findings],
      decisions.reviews,
    );
    return { ...decisions, reviews: [...prepared.retained, ...prepared.reviews] };
  });
  return {
    reviews: prepared.reviews,
    decisionsPath: written.path,
    receipt: toReceipt(prepared, written.path, false, true),
  };
}

export async function runReviewPrune(
  root: string,
  write = false,
): Promise<ReviewPruneResult> {
  const resolved = resolve(root);
  const [audit, baselineFingerprints] = await Promise.all([
    runAudit(resolved),
    currentBaselineFingerprints(resolved),
  ]);
  const preview = await readDecisions(resolved);
  const classified = classifyPrune(preview.reviews, [...audit.findings, ...preview.findings], baselineFingerprints);
  if (write && classified.removable.length > 0) {
    const written = await updateDecisions(resolved, (decisions) => {
      const next = classifyPrune(
        decisions.reviews,
        [...audit.findings, ...decisions.findings],
        baselineFingerprints,
      );
      return { ...decisions, reviews: next.retained };
    });
    const after = classifyPrune(
      written.file.reviews,
      [...audit.findings, ...written.file.findings],
      baselineFingerprints,
    );
    return {
      removable: classified.removable,
      retained: after.retained,
      decisionsPath: written.path,
      wrote: true,
    };
  }
  return {
    removable: classified.removable,
    retained: classified.retained,
    decisionsPath: decisionsPath(resolved),
    wrote: false,
  };
}

interface PreparedReviews {
  reviews: FindingReview[];
  retained: FindingReview[];
  replacements: ReviewReplacement[];
  targets: ReviewApplyReceipt["targets"];
  groups: ReviewApplyReceipt["groups"];
}

function prepareReviews(
  requests: ReviewRequest[],
  findings: Finding[],
  existing: FindingReview[],
): PreparedReviews {
  const reviews: FindingReview[] = [];
  const seenFingerprints = new Set<string>();
  const seenIdentities = new Set<string>();
  const targets: ReviewApplyReceipt["targets"] = [];
  const replacements: ReviewReplacement[] = [];
  const requestGroups = new Map<number, string>();
  const receiptGroups = new Map<string, ReviewApplyReceipt["groups"][number]>();

  for (const request of requests) {
    const finding = resolveFinding(findings, request.fingerprint);
    if (!finding) {
      throw new Error(
        `No finding with fingerprint ${request.fingerprint}. Run \`coherent audit\` first, or add the semantic finding to decisions.json.`,
      );
    }
    const identityKey = `${finding.ruleId}\u0000${finding.identity}`;
    const groupKey = reviewGroupKey(finding);
    if (request.requestGroup !== undefined) {
      const expectedGroup = requestGroups.get(request.requestGroup);
      if (expectedGroup !== undefined && expectedGroup !== groupKey) {
        throw new Error(
          `Grouped review item spans unrelated evidence groups (${expectedGroup} and ${groupKey}). Split it into separately reasoned batch items.`,
        );
      }
      requestGroups.set(request.requestGroup, groupKey);
    }
    if (seenFingerprints.has(finding.fingerprint) || seenIdentities.has(identityKey)) {
      throw new Error(`Review batch contains the same finding more than once: ${request.fingerprint}.`);
    }
    seenFingerprints.add(finding.fingerprint);
    seenIdentities.add(identityKey);
    validateReviewLifecycle(finding.ruleId, request.decision, request);
    validateReviewReason(request.decision, request.reason);
    const review = toReview(finding, request);
    const previous = existing.find((item) => item.fingerprint === finding.fingerprint);
    if (previous && previous.decision !== review.decision) {
      replacements.push({
        fingerprint: finding.fingerprint,
        previousDecision: previous.decision,
        nextDecision: review.decision,
      });
    }
    targets.push({
      fingerprint: finding.fingerprint,
      identity: finding.identity,
      ruleId: finding.ruleId,
      title: finding.title,
      reviewGroupKey: groupKey,
    });
    const receiptGroup = receiptGroups.get(groupKey) ?? {
      reviewGroupKey: groupKey,
      ruleId: finding.ruleId,
      count: 0,
      files: [],
    };
    receiptGroup.count += 1;
    receiptGroup.files = [...new Set([
      ...receiptGroup.files,
      ...finding.locations.map((location) => location.file),
    ])].sort();
    receiptGroups.set(groupKey, receiptGroup);
    reviews.push(review);
  }

  const replacedFingerprints = new Set(reviews.map((review) => review.fingerprint));
  const replacedIdentities = new Set(
    reviews.map((review) => `${review.ruleId}\u0000${review.identity}`),
  );
  const retained = existing.filter(
    (review) =>
      !replacedFingerprints.has(review.fingerprint) &&
      !replacedIdentities.has(`${review.ruleId}\u0000${review.identity}`),
  );
  return {
    reviews,
    retained,
    replacements,
    targets,
    groups: [...receiptGroups.values()],
  };
}

function toReceipt(
  prepared: PreparedReviews,
  decisionsPathValue: string,
  dryRun: boolean,
  wrote: boolean,
): ReviewApplyReceipt {
  return {
    runtime: portableRuntimeIdentity(),
    dryRun,
    decisionsPath: decisionsPathValue,
    wrote,
    targets: prepared.targets,
    groups: prepared.groups,
    replacements: prepared.replacements,
    conflicts: [],
    reviews: prepared.reviews,
  };
}

function classifyPrune(
  reviews: FindingReview[],
  known: Finding[],
  baselineFingerprints: ReadonlySet<string>,
): { removable: FindingReview[]; retained: FindingReview[] } {
  const removable: FindingReview[] = [];
  const retained: FindingReview[] = [];
  for (const review of reviews) {
    const match = classifyReview(review, known);
    const resolvedHistory =
      match === "orphan" &&
      reviewLifecycleState(review) === "current" &&
      baselineFingerprints.has(review.fingerprint);
    if (match === "applied" || resolvedHistory) retained.push(review);
    else removable.push(review);
  }
  return { removable, retained };
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
  const semanticEquivalence = request.semanticEquivalence ?? finding.semanticEquivalence;
  const authoritativeConcept = request.authoritativeConcept ?? finding.authoritativeConcept;
  return {
    fingerprint: finding.fingerprint,
    ruleId: finding.ruleId,
    identity: finding.identity,
    decision: request.decision,
    reason: request.reason,
    reviewedAt: new Date().toISOString(),
    fingerprintVersion: FINGERPRINT_VERSION,
    detectorRevision: DETECTOR_REVISION,
    ruleDetectorRevision: detectorRevisionForRule(finding.ruleId),
    ...(request.expiresAt ? { expiresAt: request.expiresAt } : {}),
    ...(request.removalMilestone ? { removalMilestone: request.removalMilestone } : {}),
    ...(request.notCompatibility ? { notCompatibility: true as const } : {}),
    ...(request.missingEvidence ? { missingEvidence: request.missingEvidence } : {}),
    ...(request.reconsiderWhen ? { reconsiderWhen: request.reconsiderWhen } : {}),
    ...(semanticEquivalence ? { semanticEquivalence } : {}),
    ...(authoritativeConcept ? { authoritativeConcept } : {}),
  };
}

async function currentBaselineFingerprints(root: string): Promise<Set<string>> {
  const baseline = await readBaseline(root);
  if (!baseline || isBaselineStale(baseline)) return new Set();
  const staleRules = new Set(staleBaselineRuleIds(baseline));
  return new Set(
    baseline.findings
      .filter((entry) => !staleRules.has(entry.ruleId))
      .map((entry) => entry.fingerprint),
  );
}
