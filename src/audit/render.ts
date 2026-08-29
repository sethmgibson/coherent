import { PHASES } from "../catalog/phases.js";
import { RULES_BY_ID } from "../catalog/rules.js";
import type { Finding } from "../domain/finding.js";
import { renderMetrics } from "./metrics.js";
import type { AuditResult } from "./run.js";

export function renderAudit(result: AuditResult): string {
  const { findings, inventory, durationMs } = result;
  const confirmed = findings.filter((finding) => finding.status === "confirmed");
  const candidates = findings.filter((finding) => finding.status === "candidate");
  const lines = [
    "Coherent audit",
    `Root: ${inventory.root}`,
    `Files: ${inventory.fileCount}  Findings: ${findings.length} (${confirmed.length} confirmed, ${candidates.length} candidates)`,
    `Scan: ${formatDuration(durationMs)}`,
    result.file.architecturePath
      ? `Architecture: ${result.file.architecturePath}`
      : "Architecture: missing — run `coherent init` before treating this as a full audit.",
    "",
  ];

  const byPhase = new Map<number, Finding[]>();
  for (const finding of findings) {
    const phase = RULES_BY_ID[finding.ruleId].defaultCleanupPhase;
    const list = byPhase.get(phase) ?? [];
    list.push(finding);
    byPhase.set(phase, list);
  }

  for (const phase of PHASES) {
    const group = byPhase.get(phase.id);
    if (!group || group.length === 0) continue;
    lines.push(phase.title.toUpperCase());
    const byRule = groupBy(group, (finding) => finding.ruleId);
    for (const [ruleId, ruleFindings] of byRule) {
      const rule = RULES_BY_ID[ruleId as keyof typeof RULES_BY_ID];
      const conf = ruleFindings.filter((finding) => finding.status === "confirmed").length;
      const cand = ruleFindings.filter((finding) => finding.status === "candidate").length;
      lines.push(`  ${rule.title}: ${conf} confirmed, ${cand} candidates`);
      for (const finding of ruleFindings.slice(0, 12)) {
        const loc = finding.locations[0];
        const where = loc
          ? `${loc.file}${loc.symbol ? ` ${loc.symbol}` : ""}`
          : finding.affectedSymbols[0] ?? finding.identity;
        lines.push(
          `    [${finding.status} ${finding.confidence} ${finding.detectionMode}] ${finding.title} — ${where}`,
        );
        lines.push(`      Review id: ${finding.fingerprint.slice(0, 12)}`);
        lines.push(`      ${finding.evidence.summary}`);
      }
      if (ruleFindings.length > 12) {
        lines.push(`    … ${ruleFindings.length - 12} more`);
      }
    }
    lines.push("");
  }

  if (findings.length === 0) {
    lines.push("No findings from the implemented detectors.");
  } else {
    lines.push(
      "Confirmed and candidates are listed separately. The catalog is not a cleanup order.",
    );
    lines.push("A later `coherent plan` builds the DAG. Do not treat this dump as a work queue.");
    lines.push("");
    lines.push(renderMetrics(result.file.metrics).trimEnd());
  }
  return `${lines.join("\n")}\n`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}
