import { RULES_BY_ID } from "../catalog/rules.js";
import type { Finding } from "../domain/finding.js";
import type { FindingGroup } from "./types.js";

export interface ScoreInput {
  group: FindingGroup;
  findings: Finding[];
  prerequisiteCount: number;
  dependentCount: number;
  rescanCount: number;
  indirectCount: number;
}

/**
 * Higher is earlier. Does not sort by rule ID, severity, or phase alone.
 * A high-confidence A08 deletion can outrank a higher-severity semantic issue.
 */
export function scoreNode(input: ScoreInput): number {
  const { findings } = input;
  if (findings.length === 0) return 0;

  let score = 0;
  if (input.prerequisiteCount === 0) score += 50;
  else score -= input.prerequisiteCount * 8;

  const phase = Math.min(...findings.map((finding) => RULES_BY_ID[finding.ruleId].defaultCleanupPhase));
  const confidences = findings.map((finding) => finding.confidence);
  if (confidences.every((value) => value === "high")) score += phase >= 8 ? 8 : 25;
  else if (confidences.some((value) => value === "high")) score += phase >= 8 ? 4 : 14;
  else if (confidences.some((value) => value === "medium")) score += 8;

  const confirmed = findings.every((finding) => finding.status === "confirmed");
  if (confirmed) score += 20;
  else if (findings.some((finding) => finding.status === "confirmed")) score += 8;

  score += surfaceReduction(findings);
  if (confirmed) {
    score += input.rescanCount * 6 + input.dependentCount * 4 + input.indirectCount * 3;
  } else {
    score += input.indirectCount;
  }
  score += simplification(findings);
  score -= behavioralRiskPenalty(findings);
  score += testBonus(findings);
  score += phaseTieBreak(findings);
  return score;
}

function surfaceReduction(findings: Finding[]): number {
  let value = 0;
  for (const finding of findings) {
    if (finding.ruleId === "A08" && finding.status === "confirmed") value += 30;
    else if (finding.ruleId === "A08") value += 18;
    else if (finding.ruleId === "A07" && /no internal callers/i.test(finding.evidence.details?.join(" ") ?? "")) {
      value += 16;
    } else if (finding.ruleId === "A07") value += 6;
    else if (finding.ruleId === "A04" || finding.ruleId === "A06") value += 8;
    else if (finding.ruleId === "D01" && finding.status === "confirmed") value += 12;
  }
  return Math.min(value, 48);
}

function simplification(findings: Finding[]): number {
  const rules = new Set(findings.map((finding) => finding.ruleId));
  if (rules.has("A08") || rules.has("A07")) return 12;
  if (findings.some((finding) => (finding.ruleId === "A04" || finding.ruleId === "A06") && finding.status === "confirmed")) {
    return 12;
  }
  if (rules.has("A04") || rules.has("A05") || rules.has("A06")) return 4;
  if (rules.has("B04") || rules.has("B05") || rules.has("B01")) return 6;
  return 2;
}

function behavioralRiskPenalty(findings: Finding[]): number {
  if (findings.every((finding) => finding.ruleId === "A08")) {
    return findings.some((finding) => finding.status === "candidate") ? 6 : 2;
  }
  const texts = findings.map((finding) => finding.changeRisk.toLowerCase());
  if (texts.some((text) => text.includes("high") || text.includes("do not delete"))) return 18;
  if (findings.some((finding) => finding.status === "candidate")) return 8;
  if (findings.some((finding) => RULES_BY_ID[finding.ruleId].detectionMode === "semantic")) {
    return 10;
  }
  return 2;
}

function testBonus(findings: Finding[]): number {
  if (findings.some((finding) => finding.testSafetyEvidence)) return 6;
  return 0;
}

function phaseTieBreak(findings: Finding[]): number {
  const phase = Math.min(...findings.map((finding) => RULES_BY_ID[finding.ruleId].defaultCleanupPhase));
  return (8 - phase) * 3;
}
