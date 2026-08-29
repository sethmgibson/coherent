import type { RuleId } from "../catalog/types.js";
import type { Finding } from "../domain/finding.js";

export const REVIEW_DECISIONS = ["confirmed", "dismissed", "deferred"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export interface FindingReview {
  fingerprint: string;
  ruleId: RuleId;
  identity: string;
  decision: ReviewDecision;
  reason: string;
  reviewedAt: string;
  /** Hash algorithm that produced `fingerprint`. Informational; does not gate identity fallback. */
  fingerprintVersion?: number;
  /** Detector semantics this decision was made under. Required for identity fallback. */
  detectorRevision?: number;
  semanticEquivalence?: string;
  authoritativeConcept?: string;
}

export interface ReviewsFile {
  schemaVersion: 1;
  reviews: FindingReview[];
}

export interface SemanticFindingsFile {
  schemaVersion: 1;
  findings: Finding[];
}

export interface DecisionsFile {
  schemaVersion: 1;
  reviews: FindingReview[];
  findings: Finding[];
}

export interface MergedFindings {
  findings: Finding[];
  deferred: Set<string>;
  needsReview: Set<string>;
}
