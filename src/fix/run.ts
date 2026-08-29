import { PHASES_BY_ID } from "../catalog/phases.js";
import { RULES_BY_ID } from "../catalog/rules.js";
import { runPlan } from "../plan/run.js";
import type { CleanupNode, CleanupPlan } from "../plan/types.js";
import { selectNextNode } from "./select.js";

export interface FixNextResult {
  plan: CleanupPlan;
  node: CleanupNode | undefined;
}

export async function runFixNext(root: string): Promise<FixNextResult> {
  const { plan } = await runPlan(root);
  const node = selectNextNode(plan);
  return { plan, node };
}

export function renderFixNext(result: FixNextResult): string {
  if (!result.node) {
    if (result.plan.nodes.length === 0) {
      return "Coherent fix next\n\nNo cleanup nodes. Reviewed plan is clean.\n";
    }
    return "Coherent fix next\n\nNo unlocked cleanup node. Remaining nodes need review or are blocked.\n";
  }
  return `${workBrief(result.node)}\n`;
}

function workBrief(node: CleanupNode): string {
  const findingNames = node.ruleIds.map((id) => RULES_BY_ID[id].title);
  const rescanNames = node.rescanAfter.map((id) => RULES_BY_ID[id].title);
  const phase = PHASES_BY_ID[node.defaultPhase];
  return [
    "Coherent fix next — one bounded cleanup node",
    "",
    `Work item: ${node.title}`,
    `Finding types: ${findingNames.join(", ")}`,
    `Cleanup stage: ${phase.title} (tie-break only)  ${node.status} ${node.confidence}`,
    `Files: ${node.likelyFiles.join(", ") || "(none)"}`,
    `Symbols: ${node.concepts.join(", ") || "(none)"}`,
    "",
    `Why this node: ${node.reasonForOrdering}`,
    `Simplification: ${node.expectedSimplification}`,
    `Deletion potential: ${node.deletionPotential}`,
    `Unlocks: ${node.unlocks}`,
    `Risk: ${node.behavioralRisk}`,
    `Tests: ${node.testSafetyEvidence}`,
    node.rescanAfter.length > 0
      ? `Re-scan after: ${rescanNames.join(", ")}`
      : "Re-scan after: none",
    "",
    "Before editing: inspect callers, callees, registration, public reachability, tests, and ARCHITECTURE.md.",
    "For dead-code deletion, verify DI, decorators, reflection, jobs, CLI, dynamic imports, exports, and external APIs.",
    "During editing: prefer deletion and consolidation. Do not add replacement abstractions or compatibility wrappers.",
    "After editing: typecheck, targeted tests, `coherent audit`, `coherent check`, confirm the finding is gone, inspect newly dead code, update the cleanup plan and architecture notes.",
    "Do not rewrite the repository wholesale.",
  ].join("\n");
}
