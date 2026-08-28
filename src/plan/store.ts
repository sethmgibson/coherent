import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BACKEND_DIR, PLAN_FILE } from "../config.js";
import type { CleanupPlan } from "./types.js";

export function planPath(root: string): string {
  return join(root, BACKEND_DIR, PLAN_FILE);
}

export async function writePlanFile(plan: CleanupPlan): Promise<string> {
  const path = planPath(plan.root);
  await mkdir(join(plan.root, BACKEND_DIR), { recursive: true });
  await writeFile(path, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  return path;
}
