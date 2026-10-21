import { RULES_BY_ID } from "../catalog/rules.js";
import type { DetectionMode, RuleId } from "../catalog/types.js";
import {
  createFinding,
  type Confidence,
  type Finding,
  type FindingInput,
  type FindingEvidence,
  type FindingStatus,
  type Severity,
  type SourceLocation,
} from "../domain/finding.js";

export type Evidence = Omit<FindingInput, "cleanupBenefit" | "changeRisk" | "prerequisiteFindingIds">
  & Partial<Pick<FindingInput, "cleanupBenefit" | "changeRisk">>;

export function makeEvidence(input: {
  ruleId: RuleId;
  identity: string;
  title?: string;
  severity: Severity;
  confidence: Confidence;
  status: FindingStatus;
  detectionMode?: DetectionMode;
  explanation: string;
  evidence: FindingEvidence;
  locations: SourceLocation[];
  affectedSymbols: string[];
  authoritativeConcept?: string;
  semanticEquivalence?: string;
  deletionOpportunity?: string;
  cleanupBenefit?: string;
  unlocks?: string;
  changeRisk?: string;
  testSafetyEvidence?: string;
}): Evidence {
  const rule = RULES_BY_ID[input.ruleId];
  return {
    ruleId: input.ruleId,
    title: input.title ?? rule.title,
    identity: input.identity,
    severity: input.severity,
    confidence: input.confidence,
    detectionMode: input.detectionMode ?? rule.detectionMode,
    status: input.status,
    explanation: input.explanation,
    evidence: input.evidence,
    locations: input.locations,
    affectedSymbols: input.affectedSymbols,
    ...(input.authoritativeConcept
      ? { authoritativeConcept: input.authoritativeConcept }
      : {}),
    ...(input.semanticEquivalence
      ? { semanticEquivalence: input.semanticEquivalence }
      : {}),
    ...(input.deletionOpportunity
      ? { deletionOpportunity: input.deletionOpportunity }
      : {}),
    ...(input.cleanupBenefit ? { cleanupBenefit: input.cleanupBenefit } : {}),
    ...(input.unlocks ? { unlocks: input.unlocks } : {}),
    ...(input.changeRisk ? { changeRisk: input.changeRisk } : {}),
    ...(input.testSafetyEvidence ? { testSafetyEvidence: input.testSafetyEvidence } : {}),
  };
}

/** Legacy advanced Finding enrichment is deliberately outside evidence collection. */
export function findingFromEvidence(evidence: Evidence): Finding {
  return createFinding({
    ...evidence,
    cleanupBenefit: evidence.cleanupBenefit ?? RULES_BY_ID[evidence.ruleId].whyItMatters,
    changeRisk: evidence.changeRisk ?? "Inspect callers, contracts and external reachability before editing.",
    prerequisiteFindingIds: [],
  });
}
