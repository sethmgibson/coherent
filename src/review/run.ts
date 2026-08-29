import { resolve } from "node:path";
import { runAudit } from "../audit/run.js";
import { DETECTOR_REVISION, FINGERPRINT_VERSION } from "../config.js";
import type { Finding } from "../domain/finding.js";
import { decisionsPath, readDecisions, upsertReview } from "./store.js";
import type { FindingReview, ReviewDecision } from "./types.js";

export interface ReviewResult {
  review: FindingReview;
  decisionsPath: string;
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
      `No finding with fingerprint ${fingerprint}. Run \`coherent audit\` first, or add the semantic finding to decisions.json.`,
    );
  }
  const review: FindingReview = {
    fingerprint: finding.fingerprint,
    ruleId: finding.ruleId,
    identity: finding.identity,
    decision,
    reason,
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
  await upsertReview(resolved, review);
  return { review, decisionsPath: decisionsPath(resolved) };
}

async function lookupFinding(root: string, fingerprint: string): Promise<Finding | undefined> {
  const mechanical = (await runAudit(root)).findings;
  const decisions = await readDecisions(root);
  const findings = [...mechanical, ...decisions.findings];
  const exact = findings.find((finding) => finding.fingerprint === fingerprint);
  if (exact) return exact;
  const prefixMatches = findings.filter((finding) => finding.fingerprint.startsWith(fingerprint));
  if (prefixMatches.length === 1) return prefixMatches[0];
  if (prefixMatches.length > 1) {
    throw new Error(`Finding fingerprint prefix ${fingerprint} is ambiguous.`);
  }
  return undefined;
}
