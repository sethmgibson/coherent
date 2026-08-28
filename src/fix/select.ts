import type { CleanupNode, CleanupPlan } from "../plan/types.js";

export function selectNextNode(plan: CleanupPlan): CleanupNode | undefined {
  return plan.nodes.find((node) => node.state === "ready");
}
