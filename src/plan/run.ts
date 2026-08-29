import { runAudit } from "../audit/run.js";
import { PORTABLE_ROOT } from "../config.js";
import { applyReviews } from "../review/apply.js";
import { readReviews, readSemanticFindings } from "../review/store.js";
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
  const reviews = await readReviews(root);
  const semantic = await readSemanticFindings(root);
  const merged = applyReviews(audit.findings, reviews.reviews, semantic);
  const plan = buildPlan(PORTABLE_ROOT, merged.findings, merged);
  const planPath = await writePlanFile(root, plan);
  return { plan, planPath, findingCount: merged.findings.length };
}
