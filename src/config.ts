import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RuleId } from "./catalog/types.js";
import { COHERENT_VERSION } from "./version.js";

export { COHERENT_VERSION } from "./version.js";

export const COHERENT_DIR = ".coherent";
/** @deprecated Use COHERENT_DIR. Same value; kept for one release. */
export const BACKEND_DIR = COHERENT_DIR;
export const LEGACY_BACKEND_DIR = ".backend";
export const BASELINE_FILE = "baseline.json";
export const ARCHITECTURE_FILE = "ARCHITECTURE.md";
export const DECISIONS_FILE = "decisions.json";
/** @deprecated Read-only compatibility with pre-decisions state. */
export const REVIEWS_FILE = "reviews.json";
/** @deprecated Read-only compatibility with pre-decisions state. */
export const SEMANTIC_FINDINGS_FILE = "semantic-findings.json";

export const ARTIFACT_SCHEMA_VERSION = 1;
/** Bump when the fingerprint hash payload changes. Identity match still applies if detectorRevision matches. */
export const FINGERPRINT_VERSION = 2;
/** Portable release-wide detector contract used by the skill/runtime handshake. */
export const DETECTOR_REVISION = 10;
/**
 * Detector reviews are invalidated per rule. Entries that are not bumped
 * retain their prior contract, so an unrelated detector change does not erase
 * reviewed history.
 */
export const RULE_DETECTOR_REVISIONS: Readonly<Record<RuleId, number>> = {
  A01: 8,
  A02: 8,
  A03: 9,
  A04: 8,
  A05: 8,
  A06: 9,
  A07: 8,
  A08: 9,
  B01: 8,
  B02: 8,
  B03: 9,
  B04: 11,
  B05: 8,
  B06: 8,
  C01: 8,
  C02: 8,
  C03: 9,
  C04: 9,
  C05: 8,
  D01: 8,
  D02: 8,
  D03: 11,
  D04: 8,
  D05: 8,
  E01: 8,
  E02: 8,
  E03: 8,
  E04: 8,
  E05: 8,
  E06: 8,
};
export const PORTABLE_ROOT = ".";

export function detectorRevisionForRule(ruleId: RuleId): number {
  return RULE_DETECTOR_REVISIONS[ruleId];
}

export function artifactVersions() {
  return {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    coherentVersion: COHERENT_VERSION,
    fingerprintVersion: FINGERPRINT_VERSION,
    detectorRevision: DETECTOR_REVISION,
    ruleDetectorRevisions: { ...RULE_DETECTOR_REVISIONS },
  };
}

export interface CoherentConfig {
  /** Extra directory or file names to skip during inventory. */
  ignore?: string[];
  /** Optional Python interpreter. Auto-detected `python3` / `python` when omitted. */
  python?: string;
}

export async function loadConfig(root: string): Promise<CoherentConfig> {
  const path = join(root, "coherent.json");
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as CoherentConfig;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${path} must contain a JSON object`);
    }
    if (parsed.ignore !== undefined && !Array.isArray(parsed.ignore)) {
      throw new Error(`${path} field "ignore" must be an array of strings`);
    }
    if (parsed.python !== undefined && (typeof parsed.python !== "string" || parsed.python.length === 0)) {
      throw new Error(`${path} field "python" must be a non-empty string`);
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}
