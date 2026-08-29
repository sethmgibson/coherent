import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { FINDINGS_FILE } from "../config.js";
import { resolveStateDir } from "../state-dir.js";
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
  return join(resolveStateDir(root).path, FINDINGS_FILE);
}

export async function readFindingsFile(root: string): Promise<FindingsFile | undefined> {
  try {
    const raw = JSON.parse(await readFile(findingsPath(root), "utf8")) as FindingsFile;
    if (!raw || !Array.isArray(raw.findings)) return undefined;
    return raw;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function writeFindingsFile(file: FindingsFile, root = file.root): Promise<string> {
  const path = findingsPath(root);
  await mkdir(resolveStateDir(root).path, { recursive: true });
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  return path;
}
