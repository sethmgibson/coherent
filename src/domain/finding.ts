import { createHash } from "node:crypto";
import type { DetectionMode, RuleId } from "../catalog/types.js";

export const SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CONFIDENCES = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const FINDING_STATUSES = ["confirmed", "candidate"] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export interface SourceLocation {
  file: string;
  line?: number;
  column?: number;
  symbol?: string;
}

export interface FindingEvidence {
  summary: string;
  details?: string[];
}

export interface Finding {
  ruleId: RuleId;
  title: string;
  /** Stable evidence key. Used for fingerprints; do not include line numbers. */
  identity: string;
  severity: Severity;
  confidence: Confidence;
  detectionMode: DetectionMode;
  status: FindingStatus;
  explanation: string;
  evidence: FindingEvidence;
  locations: SourceLocation[];
  affectedSymbols: string[];
  authoritativeConcept?: string;
  /** How the involved symbols compare in meaning. May conclude they must stay distinct. */
  semanticEquivalence?: string;
  deletionOpportunity?: string;
  cleanupBenefit: string;
  /** What later cleanup this finding enables if addressed. */
  unlocks?: string;
  changeRisk: string;
  testSafetyEvidence?: string;
  prerequisiteFindingIds: string[];
  fingerprint: string;
}

export type FindingInput = Omit<Finding, "fingerprint">;

export function fingerprintFinding(input: FindingInput): string {
  const files = [
    ...new Set(input.locations.map((location) => location.file)),
  ].sort();
  const symbols = [...input.affectedSymbols].sort();
  const payload = [input.ruleId, input.identity, ...files, ...symbols].join(
    "\n",
  );
  return createHash("sha256").update(payload).digest("hex");
}

export function createFinding(input: FindingInput): Finding {
  return { ...input, fingerprint: fingerprintFinding(input) };
}

export function serializeFinding(finding: Finding): string {
  return JSON.stringify(finding);
}

export function parseFinding(json: string): Finding {
  const value = JSON.parse(json) as Finding;
  if (
    typeof value !== "object" ||
    value === null ||
    typeof value.ruleId !== "string" ||
    typeof value.fingerprint !== "string" ||
    !Array.isArray(value.locations)
  ) {
    throw new Error("Invalid finding JSON");
  }
  return value;
}
