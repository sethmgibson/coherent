import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { lockSibling, withFileLock, writeFileAtomic } from "./lock.js";
import { RULE_IDS, type RuleId } from "../catalog/types.js";
import {
  DECISIONS_FILE,
  REVIEWS_FILE,
  SEMANTIC_FINDINGS_FILE,
} from "../config.js";
import { resolveStateDir } from "../state-dir.js";
import {
  createFinding,
  parseFindingInput,
  SEMANTIC_FINDING_MODES,
  type Finding,
} from "../domain/finding.js";
import {
  REVIEW_DECISIONS,
  type DecisionsFile,
  type FindingReview,
  type ReviewsFile,
  type SemanticFindingsFile,
} from "./types.js";
import { isReviewExpiry } from "./lifecycle.js";

export function decisionsPath(root: string): string {
  return join(resolveStateDir(root).path, DECISIONS_FILE);
}

function legacyReviewsPath(root: string): string {
  return join(resolveStateDir(root).path, REVIEWS_FILE);
}

function legacySemanticFindingsPath(root: string): string {
  return join(resolveStateDir(root).path, SEMANTIC_FINDINGS_FILE);
}

export async function readDecisions(root: string): Promise<DecisionsFile> {
  try {
    const raw = JSON.parse(await readFile(decisionsPath(root), "utf8")) as unknown;
    return parseDecisionsFile(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const [reviews, findings] = await Promise.all([
    readLegacyReviews(root),
    readLegacySemanticFindings(root),
  ]);
  return { schemaVersion: 1, reviews: reviews.reviews, findings: findings.findings };
}

export async function writeDecisions(root: string, file: DecisionsFile): Promise<string> {
  const path = decisionsPath(root);
  await mkdir(resolveStateDir(root).path, { recursive: true });
  await writeFileAtomic(path, `${JSON.stringify(file, null, 2)}\n`);
  return path;
}

export async function updateDecisions(
  root: string,
  mutate: (current: DecisionsFile) => DecisionsFile | Promise<DecisionsFile>,
): Promise<{ file: DecisionsFile; path: string }> {
  const path = decisionsPath(root);
  await mkdir(resolveStateDir(root).path, { recursive: true });
  return withFileLock(lockSibling(path), async () => {
    const current = await readDecisions(root);
    const next = await mutate(current);
    return { file: next, path: await writeDecisions(root, next) };
  });
}

export function parseDecisionsFile(raw: unknown): DecisionsFile {
  if (
    !isRecord(raw) ||
    raw.schemaVersion !== 1 ||
    !Array.isArray(raw.reviews) ||
    !Array.isArray(raw.findings)
  ) {
    throw new Error(
      "Invalid decisions.json: expected { schemaVersion: 1, reviews: [], findings: [] }",
    );
  }
  return {
    schemaVersion: 1,
    reviews: raw.reviews.map(parseReview),
    findings: raw.findings.map(findingFromUnknown),
  };
}

export function parseReviewsFile(raw: unknown): ReviewsFile {
  if (!isRecord(raw) || raw.schemaVersion !== 1 || !Array.isArray(raw.reviews)) {
    throw new Error("Invalid reviews.json: expected { schemaVersion: 1, reviews: [] }");
  }
  return { schemaVersion: 1, reviews: raw.reviews.map(parseReview) };
}

export function parseSemanticFindingsFile(raw: unknown): SemanticFindingsFile {
  if (!isRecord(raw) || raw.schemaVersion !== 1 || !Array.isArray(raw.findings)) {
    throw new Error("Invalid semantic-findings.json: expected { schemaVersion: 1, findings: [] }");
  }
  return { schemaVersion: 1, findings: raw.findings.map(findingFromUnknown) };
}

export function findingFromUnknown(raw: unknown): Finding {
  const input = parseFindingInput(raw);
  if (!(SEMANTIC_FINDING_MODES as readonly string[]).includes(input.detectionMode)) {
    throw new Error(
      `Invalid finding: semantic-only findings must use detectionMode ${SEMANTIC_FINDING_MODES.join(" or ")}`,
    );
  }
  return createFinding(input);
}

async function readLegacyReviews(root: string): Promise<ReviewsFile> {
  try {
    return parseReviewsFile(
      JSON.parse(await readFile(legacyReviewsPath(root), "utf8")) as unknown,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { schemaVersion: 1, reviews: [] };
    }
    throw error;
  }
}

async function readLegacySemanticFindings(root: string): Promise<SemanticFindingsFile> {
  try {
    return parseSemanticFindingsFile(
      JSON.parse(await readFile(legacySemanticFindingsPath(root), "utf8")) as unknown,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { schemaVersion: 1, findings: [] };
    }
    throw error;
  }
}

function parseReview(raw: unknown): FindingReview {
  if (!isRecord(raw)) throw new Error("Invalid review: expected an object");
  if (typeof raw.fingerprint !== "string" || !raw.fingerprint) {
    throw new Error("Invalid review: missing fingerprint");
  }
  if (
    typeof raw.ruleId !== "string" ||
    !(RULE_IDS as readonly string[]).includes(raw.ruleId)
  ) {
    throw new Error("Invalid review: missing ruleId");
  }
  if (typeof raw.identity !== "string" || !raw.identity) {
    throw new Error("Invalid review: missing identity");
  }
  if (
    typeof raw.decision !== "string" ||
    !(REVIEW_DECISIONS as readonly string[]).includes(raw.decision)
  ) {
    throw new Error(`Invalid review: decision must be ${REVIEW_DECISIONS.join(", ")}`);
  }
  if (typeof raw.reason !== "string") {
    throw new Error("Invalid review: missing reason");
  }
  if (typeof raw.reviewedAt !== "string" || !raw.reviewedAt) {
    throw new Error("Invalid review: missing reviewedAt");
  }
  const fingerprintVersion = optionalVersion(raw.fingerprintVersion, "fingerprintVersion");
  const detectorRevision = optionalVersion(raw.detectorRevision, "detectorRevision");
  const expiresAt = optionalReviewText(raw.expiresAt, "expiresAt");
  if (expiresAt !== undefined && !isReviewExpiry(expiresAt)) {
    throw new Error("Invalid review: expiresAt must be an ISO date or timestamp");
  }
  const removalMilestone = optionalReviewText(
    raw.removalMilestone,
    "removalMilestone",
  );
  if (raw.notCompatibility !== undefined && raw.notCompatibility !== true) {
    throw new Error("Invalid review: notCompatibility must be true when present");
  }
  const notCompatibility = raw.notCompatibility === true;
  if (
    notCompatibility &&
    (raw.ruleId !== "A07" || raw.decision !== "dismissed")
  ) {
    throw new Error("Invalid review: notCompatibility requires a dismissed A07 review");
  }
  if (notCompatibility && (expiresAt || removalMilestone)) {
    throw new Error("Invalid review: notCompatibility cannot include lifecycle metadata");
  }
  const missingEvidence = optionalReviewText(raw.missingEvidence, "missingEvidence");
  const reconsiderWhen = optionalReviewText(raw.reconsiderWhen, "reconsiderWhen");
  return {
    fingerprint: raw.fingerprint,
    ruleId: raw.ruleId as RuleId,
    identity: raw.identity,
    decision: raw.decision as FindingReview["decision"],
    reason: raw.reason,
    reviewedAt: raw.reviewedAt,
    ...(fingerprintVersion !== undefined ? { fingerprintVersion } : {}),
    ...(detectorRevision !== undefined ? { detectorRevision } : {}),
    ...(expiresAt !== undefined ? { expiresAt } : {}),
    ...(removalMilestone !== undefined ? { removalMilestone } : {}),
    ...(notCompatibility ? { notCompatibility: true as const } : {}),
    ...(missingEvidence !== undefined ? { missingEvidence } : {}),
    ...(reconsiderWhen !== undefined ? { reconsiderWhen } : {}),
    ...(typeof raw.semanticEquivalence === "string"
      ? { semanticEquivalence: raw.semanticEquivalence }
      : {}),
    ...(typeof raw.authoritativeConcept === "string"
      ? { authoritativeConcept: raw.authoritativeConcept }
      : {}),
  };
}

function optionalReviewText(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid review: ${field} must be a non-empty string`);
  }
  return value.trim();
}

function optionalVersion(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Invalid review: ${field} must be an integer`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
