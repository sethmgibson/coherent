import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { runAudit } from "../audit/run.js";
import { isBaselineStale, readBaseline } from "../baseline/run.js";
import { ARCHITECTURE_FILE, loadConfig } from "../config.js";
import { legacyStateDirWarning, resolveStateDir } from "../state-dir.js";
import { generateArchitectureMarkdown } from "../init/architecture.js";
import {
  extractDiscoveredInteriors,
  hasDiscoveredFences,
  normalizeDiscoveredFacts,
} from "../init/refresh.js";
import { collectInventory } from "../inventory.js";
import { classifyReview, hasCurrentDetectorRevision } from "../review/apply.js";
import { reviewLifecycleState } from "../review/lifecycle.js";
import { readDecisions } from "../review/store.js";
import type { DoctorIssue, DoctorResult } from "./types.js";
import { runtimeIdentity } from "../runtime.js";
import { withDoctorSnapshot, type DoctorSnapshotOptions } from "./snapshot.js";

export interface DoctorOptions extends DoctorSnapshotOptions {
  deep?: boolean;
}

export async function runDoctor(
  root: string,
  options: DoctorOptions = {},
): Promise<DoctorResult> {
  return withDoctorSnapshot(root, options, async (snapshotRoot, target) => {
    const issues: DoctorIssue[] = [];
    checkLegacyStateDir(snapshotRoot, issues);
    await checkArchitecture(snapshotRoot, issues);
    const baseline = await checkBaseline(snapshotRoot, issues);
    await checkDecisions(
      snapshotRoot,
      issues,
      options.deep === true,
      baseline.fingerprints,
      baseline.detectorRevision,
    );
    const runtime = await runtimeIdentity(snapshotRoot);
    return { runtime, target, issues, ok: issues.length === 0 };
  });
}

function checkLegacyStateDir(root: string, issues: DoctorIssue[]): void {
  const warning = legacyStateDirWarning(root);
  if (warning) {
    issues.push({ code: "legacy-state-dir", message: warning });
  }
}

async function checkArchitecture(root: string, issues: DoctorIssue[]): Promise<void> {
  const path = join(resolveStateDir(root).path, ARCHITECTURE_FILE);
  let markdown: string;
  try {
    markdown = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      issues.push({
        code: "missing-architecture",
        message: `No ${ARCHITECTURE_FILE}. Run \`coherent init\`.`,
      });
      return;
    }
    throw error;
  }
  if (!hasDiscoveredFences(markdown)) {
    issues.push({
      code: "unfenced-architecture",
      message: "ARCHITECTURE.md has no discovered fences. Run `coherent refresh`.",
    });
    return;
  }
  const config = await loadConfig(root);
  const inventory = await collectInventory(root, config);
  const expected = extractDiscoveredInteriors(generateArchitectureMarkdown(inventory));
  const actual = extractDiscoveredInteriors(markdown);
  if (
    expected.length !== actual.length ||
    expected.some((block, index) => normalizeDiscoveredFacts(block) !== normalizeDiscoveredFacts(actual[index] ?? ""))
  ) {
    issues.push({
      code: "stale-discovery",
      message: "Fenced discovered facts do not match current inventory. Run `coherent refresh`.",
    });
  }
}

async function checkBaseline(
  root: string,
  issues: DoctorIssue[],
): Promise<{ fingerprints: Set<string>; detectorRevision?: number }> {
  try {
    const raw = await readBaseline(root);
    if (!raw) return { fingerprints: new Set() };
    const stale = isBaselineStale(raw) || raw.schemaVersion === undefined;
    if (stale) {
      issues.push({
        code: "baseline-versions",
        message: "Baseline is missing versions or they do not match this CLI. Re-run `coherent baseline`.",
      });
    }
    if (typeof raw.root === "string" && raw.root !== "." && isAbsolute(raw.root)) {
      issues.push({
        code: "baseline-absolute-root",
        message: `Baseline root is an absolute path (${raw.root}). Re-run \`coherent baseline\`.`,
      });
    }
    const fingerprints = raw.findings.map((entry) => entry.fingerprint);
    reportDuplicates(fingerprints, "baseline.json", issues);
    return {
      fingerprints: stale ? new Set() : new Set(fingerprints),
      detectorRevision: raw.detectorRevision,
    };
  } catch (error) {
    issues.push({
      code: "invalid-baseline",
      message: error instanceof Error ? error.message : "Invalid baseline.json",
    });
    return { fingerprints: new Set() };
  }
}

async function checkDecisions(
  root: string,
  issues: DoctorIssue[],
  deep: boolean,
  baselineFingerprints: ReadonlySet<string>,
  baselineDetectorRevision?: number,
): Promise<void> {
  try {
    const decisions = await readDecisions(root);
    reportDuplicates(
      decisions.findings.map((finding) => finding.fingerprint),
      "decisions.json findings",
      issues,
    );
    const semanticFingerprints = new Set(
      decisions.findings
        .filter((finding) => finding.detectionMode === "semantic")
        .map((finding) => finding.fingerprint),
    );
    reportStateVersionSkew(
      decisions.reviews,
      semanticFingerprints,
      baselineDetectorRevision,
      issues,
    );
    const stale = new Set<string>();
    for (const review of decisions.reviews) {
      const lifecycle = reviewLifecycleState(review);
      if (lifecycle !== "current") {
        stale.add(review.fingerprint);
        reportLifecycleReview(review, lifecycle, issues);
        continue;
      }
      const exactSemantic = semanticFingerprints.has(review.fingerprint);
      if (!exactSemantic && !hasCurrentDetectorRevision(review)) {
        stale.add(review.fingerprint);
        reportStaleReview(review, issues);
      }
    }
    if (!deep || decisions.reviews.length === 0) return;
    const mechanical = (await runAudit(root)).findings;
    const known = [...mechanical, ...decisions.findings];
    for (const review of decisions.reviews) {
      const match = classifyReview(review, known);
      if (match === "orphan") {
        if (baselineFingerprints.has(review.fingerprint)) continue;
        issues.push({
          code: "orphan-review",
          message: `Review ${review.decision} ${review.ruleId} ${review.identity} matches no current finding.`,
        });
      } else if (match === "stale" && !stale.has(review.fingerprint)) {
        reportStaleReview(review, issues);
      }
    }
  } catch (error) {
    issues.push({
      code: "invalid-decisions",
      message: error instanceof Error ? error.message : "Invalid decisions.json",
    });
  }
}

function reportStateVersionSkew(
  reviews: Awaited<ReturnType<typeof readDecisions>>["reviews"],
  semanticFingerprints: ReadonlySet<string>,
  baselineDetectorRevision: number | undefined,
  issues: DoctorIssue[],
): void {
  if (baselineDetectorRevision === undefined) return;
  const mismatched = reviews.filter(
    (review) =>
      !semanticFingerprints.has(review.fingerprint) &&
      review.detectorRevision !== undefined &&
      review.detectorRevision !== baselineDetectorRevision,
  );
  if (mismatched.length === 0) return;
  const revisions = [...new Set(mismatched.map((review) => review.detectorRevision))].sort();
  issues.push({
    code: "state-version-skew",
    message: `${mismatched.length} mechanical or hybrid review(s) use detector revision ${revisions.join(", ")} while baseline.json uses revision ${baselineDetectorRevision}. Commit the CLI lock, baseline, and decisions as one compatible state before trusting this snapshot.`,
  });
}

function reportLifecycleReview(
  review: Awaited<ReturnType<typeof readDecisions>>["reviews"][number],
  state: "missing" | "expired",
  issues: DoctorIssue[],
): void {
  if (state === "missing") {
    issues.push({
      code: "missing-review-lifecycle",
      message: `Compatibility review ${review.decision} ${review.ruleId} ${review.identity} has no expiresAt or removalMilestone. Re-review it with a lifecycle condition, or mark a false signal notCompatibility.`,
    });
    return;
  }
  issues.push({
    code: "expired-review",
    message: `Compatibility review ${review.decision} ${review.ruleId} ${review.identity} expired at ${review.expiresAt}. Re-review it before applying it.`,
  });
}

function reportStaleReview(
  review: Awaited<ReturnType<typeof readDecisions>>["reviews"][number],
  issues: DoctorIssue[],
): void {
  const seen = review.detectorRevision;
  issues.push({
    code: "stale-review",
    message:
      seen === undefined
        ? `Review ${review.decision} ${review.ruleId} ${review.identity} is stale (no detectorRevision). Re-review before applying it.`
        : `Review ${review.decision} ${review.ruleId} ${review.identity} is stale (detectorRevision ${seen}). Re-review before applying it.`,
  });
}

function reportDuplicates(fingerprints: string[], source: string, issues: DoctorIssue[]): void {
  const seen = new Set<string>();
  for (const fingerprint of fingerprints) {
    if (seen.has(fingerprint)) {
      issues.push({
        code: "duplicate-fingerprint",
        message: `Duplicate fingerprint in ${source}: ${fingerprint}`,
      });
    }
    seen.add(fingerprint);
  }
}
