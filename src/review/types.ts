import type { RuleId } from "../catalog/types.js";
import type { Finding } from "../domain/finding.js";
import type { PortableRuntimeIdentity } from "../runtime.js";

export const REVIEW_DECISIONS = ["confirmed", "dismissed", "deferred"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export interface ReviewLifecycle {
  /** ISO date or timestamp after which a compatibility review must be revisited. */
  expiresAt?: string;
  /** Named release, consumer migration, or other condition that permits removal. */
  removalMilestone?: string;
  /** The A07 signal was reviewed and is not compatibility behavior. */
  notCompatibility?: true;
  /** Evidence that is still missing; required for most deferrals. */
  missingEvidence?: string;
  /** When or under what condition this deferral should be reconsidered. */
  reconsiderWhen?: string;
}

export interface FindingReview extends ReviewLifecycle {
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

export interface ReviewTarget {
  fingerprint: string;
  identity: string;
  ruleId: RuleId;
  title: string;
}

export interface ReviewReplacement {
  fingerprint: string;
  previousDecision?: FindingReview["decision"];
  nextDecision: FindingReview["decision"];
}

export interface ReviewApplyReceipt {
  runtime: PortableRuntimeIdentity;
  dryRun: boolean;
  decisionsPath: string;
  wrote: boolean;
  targets: ReviewTarget[];
  replacements: ReviewReplacement[];
  conflicts: string[];
  reviews: FindingReview[];
}
