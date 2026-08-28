import { RULES_BY_ID } from "./rules.js";
import type { RuleId } from "./types.js";

/**
 * Explicit re-audit edges. Not a workflow engine: after a cleanup
 * node finishes, the agent re-runs these rules and rebuilds the DAG.
 */
export function rescanRulesFor(ruleIds: readonly RuleId[]): RuleId[] {
  const next = new Set<RuleId>();
  for (const id of ruleIds) {
    for (const rule of RULES_BY_ID[id].rescanAfter) {
      next.add(rule);
    }
  }
  return [...next];
}

export function rescanReason(ruleIds: readonly RuleId[]): string {
  const rules = rescanRulesFor(ruleIds);
  if (rules.length === 0) return "No automatic re-scan.";
  return `After this cleanup, re-audit ${rules.join(", ")}.`;
}
