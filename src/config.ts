import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const BACKEND_DIR = ".backend";
export const FINDINGS_FILE = "findings.json";
export const BASELINE_FILE = "baseline.json";
export const PLAN_FILE = "plan.json";
export const NEXT_FILE = "next.json";
export const ARCHITECTURE_FILE = "ARCHITECTURE.md";

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
