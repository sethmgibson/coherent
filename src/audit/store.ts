import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BACKEND_DIR, FINDINGS_FILE } from "../config.js";
import type { Finding } from "../domain/finding.js";
import type { Metric } from "./metrics.js";
import type { FindingGroup } from "../plan/types.js";

export interface FindingsFile {
  generatedAt: string;
  root: string;
  durationMs: number;
  architecturePath?: string;
  findings: Finding[];
  confirmed: Finding[];
  candidates: Finding[];
  groups: FindingGroup[];
  metrics: Metric[];
}

export function findingsPath(root: string): string {
  return join(root, BACKEND_DIR, FINDINGS_FILE);
}

export async function writeFindingsFile(file: FindingsFile): Promise<string> {
  const path = findingsPath(file.root);
  await mkdir(join(file.root, BACKEND_DIR), { recursive: true });
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  return path;
}
