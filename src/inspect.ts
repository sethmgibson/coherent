import {
  compactFindingsFile,
  runAudit,
  type AuditResult,
  type CompactFindingsFile,
} from "./audit/run.js";
import { formatDuration } from "./audit/render.js";
import { RULES_BY_ID } from "./catalog/rules.js";
import type { RuleId } from "./catalog/types.js";
import type { Finding } from "./domain/finding.js";
import type { CleanupNode, CleanupPlan } from "./plan/types.js";
import { planFromAudit } from "./plan/run.js";
import { renderPlan } from "./plan/render.js";
import { readDecisions } from "./review/store.js";
import { findingsForNode, renderFixNext, type FixNextResult } from "./fix/run.js";
import { selectNextNode } from "./fix/select.js";
import { renderRuntimeIdentity, type PortableRuntimeIdentity } from "./runtime.js";
import type { PlanOptions } from "./plan/run.js";
import { inspectWorktreeTargets } from "./fix/worktree.js";

export interface InspectResult extends FixNextResult {
  audit: AuditResult;
}

export interface InspectJson {
  runtime: PortableRuntimeIdentity;
  terminalState: CleanupPlan["terminalState"];
  audit: CompactFindingsFile;
  plan: CleanupPlan;
  nextNode: CleanupNode | null;
  nextFindings: Finding[];
  dirtyTargetFiles: string[];
  worktreeInspectionWarning?: string;
}

export async function runInspect(
  root: string,
  options: PlanOptions = {},
): Promise<InspectResult> {
  const [audit, decisions] = await Promise.all([
    runAudit(root),
    readDecisions(root),
  ]);
  const { plan, findings } = planFromAudit(audit, decisions, options);
  const node = selectNextNode(plan);
  const inspection = await inspectWorktreeTargets(root, node?.likelyFiles ?? []);
  return {
    audit,
    plan,
    node,
    findings: findingsForNode(node, findings),
    dirtyTargetFiles: inspection.dirtyFiles,
    ...(inspection.warning ? { worktreeInspectionWarning: inspection.warning } : {}),
  };
}

export function inspectJson(result: InspectResult): InspectJson {
  return {
    runtime: result.plan.runtime,
    terminalState: result.plan.terminalState,
    audit: compactFindingsFile(result.audit.file),
    plan: result.plan,
    nextNode: result.node ?? null,
    nextFindings: result.findings,
    dirtyTargetFiles: result.dirtyTargetFiles,
    ...(result.worktreeInspectionWarning
      ? { worktreeInspectionWarning: result.worktreeInspectionWarning }
      : {}),
  };
}

export function renderInspect(result: InspectResult): string {
  const { audit, plan } = result;
  const counts = new Map<RuleId, number>();
  for (const finding of audit.findings) {
    counts.set(finding.ruleId, (counts.get(finding.ruleId) ?? 0) + 1);
  }
  const detected = [...counts]
    .map(([ruleId, count]) => `${RULES_BY_ID[ruleId].title}: ${count}`)
    .join("; ");
  const lines = [
    "Coherent inspect",
    renderRuntimeIdentity(plan.runtime),
    `Root: ${audit.inventory.root}`,
    `Terminal state: ${plan.terminalState}`,
    `Files: ${audit.inventory.fileCount}  Raw signals: ${audit.findings.length}  Scan: ${formatDuration(audit.durationMs)}`,
    audit.file.architecturePath
      ? `Architecture: ${audit.file.architecturePath}`
      : "Architecture: missing — run `coherent init` before treating this as a full inspection.",
    `Detected: ${detected || "none"}`,
    "",
    renderPlan(plan, { includeRuntime: false }).trimEnd(),
    "",
    renderFixNext(result, { includeRuntime: false }).trimEnd(),
  ];
  return `${lines.join("\n")}\n`;
}
