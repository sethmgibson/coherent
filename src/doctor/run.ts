import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { readFindingsFile } from "../audit/store.js";
import { isBaselineStale, type BaselineFile } from "../baseline/run.js";
import { ARCHITECTURE_FILE, BASELINE_FILE, loadConfig } from "../config.js";
import { legacyStateDirWarning, resolveStateDir } from "../state-dir.js";
import { generateArchitectureMarkdown } from "../init/architecture.js";
import {
  extractDiscoveredInteriors,
  hasDiscoveredFences,
} from "../init/refresh.js";
import { collectInventory } from "../inventory.js";
import { matchReview } from "../review/apply.js";
import {
  parseSemanticFindingsFile,
  readReviews,
  semanticFindingsPath,
} from "../review/store.js";
import type { DoctorIssue, DoctorResult } from "./types.js";

export async function runDoctor(root: string): Promise<DoctorResult> {
  const issues: DoctorIssue[] = [];
  checkLegacyStateDir(root, issues);
  await checkArchitecture(root, issues);
  await checkBaseline(root, issues);
  await checkDuplicates(root, issues);
  await checkReviews(root, issues);
  await checkSemanticFindings(root, issues);
  return { issues, ok: issues.length === 0 };
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
  if (expected.some((block, index) => block !== actual[index]) || actual.length !== expected.length) {
    issues.push({
      code: "stale-discovery",
      message: "Fenced discovered facts do not match current inventory. Run `coherent refresh`.",
    });
  }
}

async function checkBaseline(root: string, issues: DoctorIssue[]): Promise<void> {
  try {
    const raw = JSON.parse(await readFile(join(resolveStateDir(root).path, BASELINE_FILE), "utf8")) as BaselineFile;
    if (!raw || !Array.isArray(raw.findings)) {
      issues.push({ code: "missing-baseline", message: "baseline.json is invalid. Re-run `coherent baseline`." });
      return;
    }
    if (isBaselineStale(raw) || raw.schemaVersion === undefined) {
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
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      issues.push({ code: "missing-baseline", message: "No baseline.json. Run `coherent baseline`." });
      return;
    }
    throw error;
  }
}

async function checkDuplicates(root: string, issues: DoctorIssue[]): Promise<void> {
  const file = await readFindingsFile(root);
  if (!file) return;
  reportDuplicates(
    file.findings.map((finding) => finding.fingerprint),
    "findings.json",
    issues,
  );
}

async function checkReviews(root: string, issues: DoctorIssue[]): Promise<void> {
  try {
    const reviews = await readReviews(root);
    const mechanical = (await readFindingsFile(root))?.findings ?? [];
    let semantic: ReturnType<typeof parseSemanticFindingsFile>["findings"] = [];
    try {
      semantic = parseSemanticFindingsFile(
        JSON.parse(await readFile(semanticFindingsPath(root), "utf8")) as unknown,
      ).findings;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        /* invalid semantic file is reported separately */
      }
    }
    const known = [...mechanical, ...semantic];
    for (const review of reviews.reviews) {
      const matched = known.some((finding) => matchReview(finding, [review]));
      if (!matched) {
        issues.push({
          code: "orphan-review",
          message: `Review ${review.decision} ${review.ruleId} ${review.identity} matches no current finding.`,
        });
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    issues.push({
      code: "invalid-reviews",
      message: error instanceof Error ? error.message : "Invalid reviews.json",
    });
  }
}

async function checkSemanticFindings(root: string, issues: DoctorIssue[]): Promise<void> {
  try {
    parseSemanticFindingsFile(JSON.parse(await readFile(semanticFindingsPath(root), "utf8")) as unknown);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    issues.push({
      code: "invalid-semantic-finding",
      message: error instanceof Error ? error.message : "Invalid semantic-findings.json",
    });
  }
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
