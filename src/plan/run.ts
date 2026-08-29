import { runAudit } from "../audit/run.js";
import { PORTABLE_ROOT } from "../config.js";
import { applyReviews } from "../review/apply.js";
import { readDecisions } from "../review/store.js";
import { buildPlan } from "./build.js";
import type { CleanupPlan } from "./types.js";

export interface PlanResult {
  plan: CleanupPlan;
  findingCount: number;
}

export async function runPlan(root: string): Promise<PlanResult> {
  const audit = await runAudit(root);
  const decisions = await readDecisions(root);
  const merged = applyReviews(audit.findings, decisions.reviews, decisions.findings);
  const plan = buildPlan(PORTABLE_ROOT, merged.findings, merged);
  return { plan, findingCount: merged.findings.length };
}
