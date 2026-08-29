import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NEXT_FILE } from "../config.js";
import { resolveStateDir } from "../state-dir.js";
import { runPlan } from "../plan/run.js";
import type { CleanupNode, CleanupPlan } from "../plan/types.js";
import { selectNextNode } from "./select.js";

export interface FixNextResult {
  plan: CleanupPlan;
  node: CleanupNode | undefined;
  nextPath: string;
}

export async function runFixNext(root: string): Promise<FixNextResult> {
  const { plan } = await runPlan(root);
  const node = selectNextNode(plan);
  const brief = node ? workBrief(node) : noWork();
  const nextPath = join(resolveStateDir(root).path, NEXT_FILE);
  await mkdir(resolveStateDir(root).path, { recursive: true });
  await writeFile(
    nextPath,
    `${JSON.stringify({ selectedAt: new Date().toISOString(), node: node ?? null, brief }, null, 2)}\n`,
    "utf8",
  );
  return { plan, node, nextPath };
}

export function renderFixNext(result: FixNextResult): string {
  if (!result.node) {
    return "Coherent fix next\n\nNo unlocked cleanup node. Remaining nodes need review or are blocked.\n";
  }
  return `${workBrief(result.node)}\nWrote ${result.nextPath}\n`;
}

function workBrief(node: CleanupNode): string {
  return [
    "Coherent fix next — one bounded cleanup node",
    "",
    `Node: ${node.id}`,
    `Rules: ${node.ruleIds.join(", ")}`,
    `Phase ${node.defaultPhase} (tie-break only)  ${node.status} ${node.confidence}`,
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
      ? `Re-scan after: ${node.rescanAfter.join(", ")}`
      : "Re-scan after: none",
    "",
    "Before editing: inspect callers, callees, registration, public reachability, tests, and ARCHITECTURE.md.",
    "For dead-code deletion, verify DI, decorators, reflection, jobs, CLI, dynamic imports, exports, and external APIs.",
    "During editing: prefer deletion and consolidation. Do not add replacement abstractions or compatibility wrappers.",
    "After editing: typecheck, targeted tests, `backend audit`, `backend check`, confirm the finding is gone, inspect newly dead code, update the DAG and architecture notes.",
    "Do not rewrite the repository wholesale.",
  ].join("\n");
}

function noWork(): string {
  return "No unlocked cleanup node.";
}
