import { RULES_BY_ID } from "../catalog/rules.js";
import type { DetectionMode, RuleId } from "../catalog/types.js";
import {
  createFinding,
  type Confidence,
  type Finding,
  type FindingEvidence,
  type FindingStatus,
  type Severity,
  type SourceLocation,
} from "../domain/finding.js";

export function makeFinding(input: {
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
}): Finding {
  const rule = RULES_BY_ID[input.ruleId];
  return createFinding({
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
    cleanupBenefit: input.cleanupBenefit ?? rule.whyItMatters,
    ...(input.unlocks ? { unlocks: input.unlocks } : {}),
    changeRisk:
      input.changeRisk ??
      (input.status === "confirmed"
        ? "Low if evidence holds; still review callers outside this tree."
        : "Needs semantic review before deletion or consolidation."),
    ...(input.testSafetyEvidence
      ? { testSafetyEvidence: input.testSafetyEvidence }
      : {}),
    prerequisiteFindingIds: [],
  });
}
