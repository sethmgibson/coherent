import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { resolveStateDir } from "./state-dir.js";
import { isFocusedArchitecture } from "./init/architecture.js";
import { lockSibling, withFileLock, writeFileAtomic } from "./review/lock.js";

/** Explicit context conversion only. Baselines, reviews and legacy paths remain untouched. */
export async function runMigration(root: string, write = false) {
  const directory = resolveStateDir(root).path;
  const path = join(directory, "ARCHITECTURE.md");
  const before = await optionalText(path);
  const after = before === undefined || isFocusedArchitecture(before) ? before : before
    .replace(/<!-- coherent:discovered -->[\s\S]*?<!-- \/coherent:discovered -->/g, "")
    .replace(/<!-- coherent:architecture-schema 1 -->/g, "")
    + "\n<!-- coherent:architecture-schema 2 -->\n";
  const decisionsText = await optionalText(join(directory, "decisions.json"));
  const baselineText = await optionalText(join(directory, "baseline.json"));
  const legacyReviewsText = await optionalText(join(directory, "reviews.json"));
  const legacyFindingsText = await optionalText(join(directory, "semantic-findings.json"));
  if (legacyFindingsText !== undefined) JSON.parse(legacyFindingsText);
  const legacyReviews = legacyReviewsText === undefined ? undefined : JSON.parse(legacyReviewsText) as { reviews?: Array<{ fingerprint: string; evidenceHash?: string }> };
  const decisions = decisionsText === undefined ? undefined : JSON.parse(decisionsText) as { reviews?: Array<{ fingerprint: string; evidenceHash?: string }> };
  // Fail before an explicit write if stored JSON is malformed. Never rewrite it.
  if (baselineText !== undefined) JSON.parse(baselineText);
  const reviewsNeedingEvidence = [...new Set([...(decisions?.reviews ?? []), ...(legacyReviews?.reviews ?? [])].filter(review => !review.evidenceHash).map(review => review.fingerprint))];
  const changed = before !== after;
  if (write && changed && before !== undefined && after !== undefined) {
    await withFileLock(lockSibling(path), async () => {
      if (await readFile(path, "utf8") !== before) throw new Error("Architecture changed after preview; rerun migration.");
      await writeFileAtomic(path, after);
    });
  }
  return { dryRun: !write, wrote: write && changed, architecturePath: path,
    architecture: changed ? { before, after } : null,
    reviewsNeedingEvidence,
    preserved: { baseline: baselineText === undefined ? null : hash(baselineText), decisions: decisionsText === undefined ? null : hash(decisionsText),
      legacyReviews: legacyReviewsText === undefined ? null : hash(legacyReviewsText),
      legacyFindings: legacyFindingsText === undefined ? null : hash(legacyFindingsText) },
    message: "Only managed inventory fences and the schema marker are converted. Authored text and stored decisions/baselines are preserved. Historical reviews need current source evidence before suppressing changed findings in the advanced workflow." };
}

function hash(text: string): string { return createHash("sha256").update(text).digest("hex"); }
async function optionalText(path: string): Promise<string | undefined> {
  try { return await readFile(path, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}
