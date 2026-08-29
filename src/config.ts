import { readFile } from "node:fs/promises";
import { join } from "node:path";

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
/** Bump when detector meaning or evidence changes. Identity match requires this to match. */
export const DETECTOR_REVISION = 2;
export const COHERENT_VERSION = "0.1.0";
export const PORTABLE_ROOT = ".";

export function artifactVersions() {
  return {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    coherentVersion: COHERENT_VERSION,
    fingerprintVersion: FINGERPRINT_VERSION,
    detectorRevision: DETECTOR_REVISION,
  };
}

export interface CoherentConfig {
  /** Extra directory or file names to skip during inventory. */
  ignore?: string[];
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
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}
