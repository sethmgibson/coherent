import { PHASES_BY_ID } from "../catalog/phases.js";
import type { CleanupNode, CleanupPlan } from "./types.js";

export function renderPlan(plan: CleanupPlan): string {
  const ready = plan.nodes.filter((node) => node.state === "ready");
  const blocked = plan.nodes.filter((node) => node.state === "blocked");
  const needsReview = plan.nodes.filter((node) => node.state === "needs_review");
  const lines = [
    "Coherent cleanup plan",
    `Root: ${plan.root}`,
    `Nodes: ${plan.nodes.length}  Ready: ${ready.length}  Needs review: ${needsReview.length}  Blocked: ${blocked.length}`,
    ...(plan.reviewSummary ? [renderReviewSummary(plan.reviewSummary)] : []),
    "",
    "The DAG is authoritative. Default phases break ties when dependencies are equal.",
    "Hybrid and semantic findings stay in needs_review until `coherent review confirm`.",
    "",
  ];

  if (ready.length > 0) {
    lines.push("READY (do these first)");
    for (const node of ready.slice(0, 8)) {
      lines.push(...renderNode(node));
    }
    if (ready.length > 8) lines.push(`  … ${ready.length - 8} more ready nodes`);
    lines.push("");
  }

  if (needsReview.length > 0) {
    lines.push("NEEDS REVIEW (not selected by fix next)");
    for (const node of needsReview.slice(0, 8)) {
      lines.push(...renderNode(node));
    }
    if (needsReview.length > 8) lines.push(`  … ${needsReview.length - 8} more nodes awaiting review`);
    lines.push("");
  }

  if (blocked.length > 0) {
    lines.push("BLOCKED");
    for (const node of blocked.slice(0, 6)) {
      lines.push(...renderNode(node));
    }
    if (blocked.length > 6) lines.push(`  … ${blocked.length - 6} more blocked nodes`);
    lines.push("");
  }

  if (plan.nodes.length === 0) {
    lines.push("No cleanup nodes. The reviewed plan is clean even if raw audit signals remain.");
  } else {
    lines.push("Next step: `coherent fix next` selects one unlocked node. Do not rewrite the tree wholesale.");
  }
  return `${lines.join("\n")}\n`;
}

function renderReviewSummary(summary: NonNullable<CleanupPlan["reviewSummary"]>): string {
  return `Signals: ${summary.detected}  Dismissed: ${summary.dismissed}  Confirmed: ${summary.confirmed}  Deferred: ${summary.deferred}  Awaiting review: ${summary.awaitingReview}`;
}

function renderNode(node: CleanupNode): string[] {
  const phase = PHASES_BY_ID[node.defaultPhase];
  const files = node.likelyFiles.slice(0, 3).join(", ") || "(no files)";
  return [
    `  [${node.state} score ${node.priorityScore}] ${node.title}`,
    `    stage: ${phase.title} (tie-break only)  ${node.status} ${node.confidence}`,
    `    files: ${files}`,
    `    ${node.reasonForOrdering}`,
    `    unlocks: ${node.unlocks}`,
    `    risk: ${node.behavioralRisk}`,
  ];
}
