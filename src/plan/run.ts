import { runAudit } from "../audit/run.js";
import { buildPlan } from "./build.js";
import { writePlanFile } from "./store.js";
import type { CleanupPlan } from "./types.js";

export interface PlanResult {
  plan: CleanupPlan;
  planPath: string;
  findingCount: number;
}

export async function runPlan(root: string): Promise<PlanResult> {
  const audit = await runAudit(root);
  const plan = buildPlan(root, audit.findings);
  const planPath = await writePlanFile(plan);
  return { plan, planPath, findingCount: audit.findings.length };
}
