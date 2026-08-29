import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RULE_IDS, type RuleId } from "../catalog/types.js";
import { REVIEWS_FILE, SEMANTIC_FINDINGS_FILE } from "../config.js";
import { resolveStateDir } from "../state-dir.js";
import {
  createFinding,
  type Finding,
  type FindingInput,
} from "../domain/finding.js";
import { REVIEW_DECISIONS, type FindingReview, type ReviewsFile, type SemanticFindingsFile } from "./types.js";

export function reviewsPath(root: string): string {
  return join(resolveStateDir(root).path, REVIEWS_FILE);
}

export function semanticFindingsPath(root: string): string {
  return join(resolveStateDir(root).path, SEMANTIC_FINDINGS_FILE);
}

export async function readReviews(root: string): Promise<ReviewsFile> {
  try {
    const raw = JSON.parse(await readFile(reviewsPath(root), "utf8")) as unknown;
    return parseReviewsFile(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { schemaVersion: 1, reviews: [] };
    }
    throw error;
  }
}

export async function writeReviews(root: string, file: ReviewsFile): Promise<string> {
  const path = reviewsPath(root);
  await mkdir(resolveStateDir(root).path, { recursive: true });
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  return path;
}

export async function upsertReview(root: string, review: FindingReview): Promise<ReviewsFile> {
  const file = await readReviews(root);
  const next = file.reviews.filter(
    (existing) =>
      existing.fingerprint !== review.fingerprint &&
      !(existing.ruleId === review.ruleId && existing.identity === review.identity),
  );
  next.push(review);
  const written: ReviewsFile = { schemaVersion: 1, reviews: next };
  await writeReviews(root, written);
  return written;
}

export async function readSemanticFindings(root: string): Promise<Finding[]> {
  try {
    const raw = JSON.parse(await readFile(semanticFindingsPath(root), "utf8")) as unknown;
    return parseSemanticFindingsFile(raw).findings;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
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
  if (!isRecord(raw)) throw new Error("Invalid finding: expected an object");
  if (typeof raw.ruleId !== "string" || !isRuleId(raw.ruleId)) {
    throw new Error("Invalid finding: missing ruleId");
  }
  if (typeof raw.identity !== "string" || !raw.identity) {
    throw new Error("Invalid finding: missing identity");
  }
  if (typeof raw.title !== "string" || typeof raw.explanation !== "string") {
    throw new Error("Invalid finding: missing title or explanation");
  }
  if (!Array.isArray(raw.locations) || !Array.isArray(raw.affectedSymbols)) {
    throw new Error("Invalid finding: locations and affectedSymbols must be arrays");
  }
  const input = { ...raw } as FindingInput & { fingerprint?: string };
  delete input.fingerprint;
  return createFinding(input);
}

function parseReview(raw: unknown): FindingReview {
  if (!isRecord(raw)) throw new Error("Invalid review: expected an object");
  if (typeof raw.fingerprint !== "string" || !raw.fingerprint) {
    throw new Error("Invalid review: missing fingerprint");
  }
  if (typeof raw.ruleId !== "string" || !isRuleId(raw.ruleId)) {
    throw new Error("Invalid review: missing ruleId");
  }
  if (typeof raw.identity !== "string" || !raw.identity) {
    throw new Error("Invalid review: missing identity");
  }
  if (typeof raw.decision !== "string" || !isDecision(raw.decision)) {
    throw new Error(`Invalid review: decision must be ${REVIEW_DECISIONS.join(", ")}`);
  }
  if (typeof raw.reason !== "string") {
    throw new Error("Invalid review: missing reason");
  }
  if (typeof raw.reviewedAt !== "string" || !raw.reviewedAt) {
    throw new Error("Invalid review: missing reviewedAt");
  }
  return {
    fingerprint: raw.fingerprint,
    ruleId: raw.ruleId,
    identity: raw.identity,
    decision: raw.decision,
    reason: raw.reason,
    reviewedAt: raw.reviewedAt,
    ...(typeof raw.semanticEquivalence === "string"
      ? { semanticEquivalence: raw.semanticEquivalence }
      : {}),
    ...(typeof raw.authoritativeConcept === "string"
      ? { authoritativeConcept: raw.authoritativeConcept }
      : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRuleId(value: string): value is RuleId {
  return (RULE_IDS as readonly string[]).includes(value);
}

function isDecision(value: string): value is FindingReview["decision"] {
  return (REVIEW_DECISIONS as readonly string[]).includes(value);
}
