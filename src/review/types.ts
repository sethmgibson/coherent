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

export interface MergedFindings {
  findings: Finding[];
  deferred: Set<string>;
  needsReview: Set<string>;
}
