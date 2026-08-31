import {
  compactFindingsFile,
  runAudit,
  type AuditResult,
  type CompactFindingsFile,
} from "./audit/run.js";
import { formatDuration } from "./audit/render.js";
import { RULES_BY_ID } from "./catalog/rules.js";
import type { RuleId } from "./catalog/types.js";
import type { CleanupNode, CleanupPlan } from "./plan/types.js";
import { planFromAudit } from "./plan/run.js";
import { renderPlan } from "./plan/render.js";
import { readDecisions } from "./review/store.js";
import { renderFixNext } from "./fix/run.js";
import { selectNextNode } from "./fix/select.js";

export interface InspectResult {
  audit: AuditResult;
  plan: CleanupPlan;
  node: CleanupNode | undefined;
}

export interface InspectJson {
  audit: CompactFindingsFile;
  plan: CleanupPlan;
  nextNode: CleanupNode | null;
}

export async function runInspect(root: string): Promise<InspectResult> {
  const [audit, decisions] = await Promise.all([
    runAudit(root),
    readDecisions(root),
  ]);
  const { plan } = planFromAudit(audit, decisions);
  return { audit, plan, node: selectNextNode(plan) };
}

export function inspectJson(result: InspectResult): InspectJson {
  return {
    audit: compactFindingsFile(result.audit.file),
    plan: result.plan,
    nextNode: result.node ?? null,
  };
}

export function renderInspect(result: InspectResult): string {
  const { audit, plan, node } = result;
  const counts = new Map<RuleId, number>();
  for (const finding of audit.findings) {
    counts.set(finding.ruleId, (counts.get(finding.ruleId) ?? 0) + 1);
  }
  const detected = [...counts]
    .map(([ruleId, count]) => `${RULES_BY_ID[ruleId].title}: ${count}`)
    .join("; ");
  const lines = [
    "Coherent inspect",
    `Root: ${audit.inventory.root}`,
    `Files: ${audit.inventory.fileCount}  Raw signals: ${audit.findings.length}  Scan: ${formatDuration(audit.durationMs)}`,
    audit.file.architecturePath
      ? `Architecture: ${audit.file.architecturePath}`
      : "Architecture: missing — run `coherent init` before treating this as a full inspection.",
    `Detected: ${detected || "none"}`,
    "",
    renderPlan(plan).trimEnd(),
    "",
    renderFixNext({ plan, node }).trimEnd(),
  ];
  return `${lines.join("\n")}\n`;
}
