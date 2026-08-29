import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PLAN_FILE } from "../config.js";
import { resolveStateDir } from "../state-dir.js";
import type { CleanupPlan } from "./types.js";

export function planPath(root: string): string {
  return join(resolveStateDir(root).path, PLAN_FILE);
}

export async function writePlanFile(root: string, plan: CleanupPlan): Promise<string> {
  const path = planPath(root);
  await mkdir(resolveStateDir(root).path, { recursive: true });
  await writeFile(path, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  return path;
}
