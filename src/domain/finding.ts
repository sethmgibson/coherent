import { createHash } from "node:crypto";
import {
  DETECTION_MODES,
  RULE_IDS,
  type DetectionMode,
  type RuleId,
} from "../catalog/types.js";

export const SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CONFIDENCES = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const FINDING_STATUSES = ["confirmed", "candidate"] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

/** Modes that belong in the decisions.json findings array. Deterministic findings come from the scanner. */
export const SEMANTIC_FINDING_MODES = ["semantic", "hybrid"] as const;
export type SemanticFindingMode = (typeof SEMANTIC_FINDING_MODES)[number];

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

export function parseFindingInput(raw: unknown): FindingInput {
  if (!isRecord(raw)) throw new Error("Invalid finding: expected an object");
  if (typeof raw.ruleId !== "string" || !isRuleId(raw.ruleId)) {
    throw new Error("Invalid finding: missing ruleId");
  }
  if (!isOneOf(raw.severity, SEVERITIES)) {
    throw new Error(`Invalid finding: severity must be ${SEVERITIES.join(", ")}`);
  }
  if (!isOneOf(raw.confidence, CONFIDENCES)) {
    throw new Error(`Invalid finding: confidence must be ${CONFIDENCES.join(", ")}`);
  }
  if (!isOneOf(raw.detectionMode, DETECTION_MODES)) {
    throw new Error(`Invalid finding: detectionMode must be ${DETECTION_MODES.join(", ")}`);
  }
  if (!isOneOf(raw.status, FINDING_STATUSES)) {
    throw new Error(`Invalid finding: status must be ${FINDING_STATUSES.join(", ")}`);
  }
  return {
    ruleId: raw.ruleId,
    title: requireString(raw.title, "title"),
    identity: requireNonEmptyString(raw.identity, "identity"),
    severity: raw.severity,
    confidence: raw.confidence,
    detectionMode: raw.detectionMode,
    status: raw.status,
    explanation: requireString(raw.explanation, "explanation"),
    evidence: parseEvidence(raw.evidence),
    locations: parseLocations(raw.locations),
    affectedSymbols: requireStringArray(raw.affectedSymbols, "affectedSymbols"),
    cleanupBenefit: requireString(raw.cleanupBenefit, "cleanupBenefit"),
    changeRisk: requireString(raw.changeRisk, "changeRisk"),
    prerequisiteFindingIds: requireStringArray(
      raw.prerequisiteFindingIds,
      "prerequisiteFindingIds",
    ),
    ...optionalString(raw, "authoritativeConcept"),
    ...optionalString(raw, "semanticEquivalence"),
    ...optionalString(raw, "deletionOpportunity"),
    ...optionalString(raw, "unlocks"),
    ...optionalString(raw, "testSafetyEvidence"),
  };
}

function parseEvidence(raw: unknown): FindingEvidence {
  if (!isRecord(raw)) throw new Error("Invalid finding: evidence must be an object");
  const summary = requireString(raw.summary, "evidence.summary");
  if (raw.details === undefined) return { summary };
  if (!Array.isArray(raw.details) || raw.details.some((item) => typeof item !== "string")) {
    throw new Error("Invalid finding: evidence.details must be an array of strings");
  }
  return { summary, details: raw.details };
}

function parseLocations(raw: unknown): SourceLocation[] {
  if (!Array.isArray(raw)) {
    throw new Error("Invalid finding: locations must be an array");
  }
  return raw.map((item, index) => {
    if (!isRecord(item) || typeof item.file !== "string" || !item.file) {
      throw new Error(`Invalid finding: locations[${index}] must include file`);
    }
    const location: SourceLocation = { file: item.file };
    if (item.line !== undefined) {
      if (typeof item.line !== "number" || !Number.isInteger(item.line)) {
        throw new Error(`Invalid finding: locations[${index}].line must be an integer`);
      }
      location.line = item.line;
    }
    if (item.column !== undefined) {
      if (typeof item.column !== "number" || !Number.isInteger(item.column)) {
        throw new Error(`Invalid finding: locations[${index}].column must be an integer`);
      }
      location.column = item.column;
    }
    if (item.symbol !== undefined) {
      if (typeof item.symbol !== "string") {
        throw new Error(`Invalid finding: locations[${index}].symbol must be a string`);
      }
      location.symbol = item.symbol;
    }
    return location;
  });
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid finding: missing ${field}`);
  }
  return value;
}

function requireNonEmptyString(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (!text) throw new Error(`Invalid finding: missing ${field}`);
  return text;
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Invalid finding: ${field} must be an array of strings`);
  }
  return value;
}

function optionalString(
  raw: Record<string, unknown>,
  field: keyof FindingInput,
): Partial<Pick<FindingInput, typeof field>> {
  const value = raw[field];
  if (value === undefined) return {};
  if (typeof value !== "string") {
    throw new Error(`Invalid finding: ${field} must be a string`);
  }
  return { [field]: value };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function isRuleId(value: string): value is RuleId {
  return (RULE_IDS as readonly string[]).includes(value);
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
