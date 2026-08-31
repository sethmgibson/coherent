import { RULES, type Rule } from "coherent/catalog/rules";
import { PHASES, type CleanupPhase } from "coherent/catalog/phases";
import { DETECTION_MODES, type RuleId } from "coherent/catalog/types";
import { createFinding, parseFinding, type Finding, type FindingInput } from "coherent/finding";

const rule: Rule | undefined = RULES[0];
const phase: CleanupPhase | undefined = PHASES[0];
if (!rule || !phase || !DETECTION_MODES.includes(rule.detectionMode)) {
  throw new Error("Installed catalogs are empty or inconsistent");
}

const ruleId: RuleId = rule.id;
const input: FindingInput = {
  ruleId,
  title: rule.title,
  identity: "packed-package-smoke",
  severity: "low",
  confidence: "high",
  detectionMode: rule.detectionMode,
  status: "candidate",
  explanation: "Verify the published Finding API",
  evidence: { summary: "Isolated consumer" },
  locations: [{ file: "consumer.ts" }],
  affectedSymbols: [],
  cleanupBenefit: "Keep the shipped package usable",
  changeRisk: "low",
  prerequisiteFindingIds: [],
};
const finding: Finding = createFinding(input);
const parsed: Finding = parseFinding(JSON.stringify(finding));
if (!/^[a-f0-9]{64}$/.test(finding.fingerprint) || parsed.fingerprint !== finding.fingerprint) {
  throw new Error("Installed Finding API failed its serialization round trip");
}

// These must remain type errors: declarations must not silently degrade to any.
// @ts-expect-error RuleId is a closed catalog union.
const invalidRuleId: RuleId = "not-a-rule";
// @ts-expect-error Finding severity is a closed union.
const invalidSeverity: Finding["severity"] = "urgent";
void invalidRuleId;
void invalidSeverity;
