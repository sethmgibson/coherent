import { resolve } from "node:path";
import { readFindingsFile } from "../audit/store.js";
import { runAudit } from "../audit/run.js";
import type { Finding } from "../domain/finding.js";
import { readSemanticFindings, reviewsPath, upsertReview } from "./store.js";
import type { FindingReview, ReviewDecision } from "./types.js";

export interface ReviewResult {
  review: FindingReview;
  reviewsPath: string;
}

export async function runReview(
  root: string,
  decision: ReviewDecision,
  fingerprint: string,
  reason: string,
): Promise<ReviewResult> {
  const resolved = resolve(root);
  const finding = await lookupFinding(resolved, fingerprint);
  if (!finding) {
    throw new Error(
      `No finding with fingerprint ${fingerprint}. Run \`coherent audit\` first, or write the finding to semantic-findings.json.`,
    );
  }
  const review: FindingReview = {
    fingerprint: finding.fingerprint,
    ruleId: finding.ruleId,
    identity: finding.identity,
    decision,
    reason,
    reviewedAt: new Date().toISOString(),
    ...(finding.semanticEquivalence
      ? { semanticEquivalence: finding.semanticEquivalence }
      : {}),
    ...(finding.authoritativeConcept
      ? { authoritativeConcept: finding.authoritativeConcept }
      : {}),
  };
  await upsertReview(resolved, review);
  return { review, reviewsPath: reviewsPath(resolved) };
}

async function lookupFinding(root: string, fingerprint: string): Promise<Finding | undefined> {
  const file = await readFindingsFile(root);
  const mechanical = file?.findings ?? (await runAudit(root)).findings;
  const semantic = await readSemanticFindings(root);
  return [...mechanical, ...semantic].find((finding) => finding.fingerprint === fingerprint);
}
