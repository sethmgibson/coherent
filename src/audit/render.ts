import { CATEGORIES, RULES } from "../catalog/rules.js";
import { renderMetrics } from "./metrics.js";
import type { AuditResult } from "./run.js";
import { renderRuntimeIdentity } from "../runtime.js";

export function renderAudit(result: AuditResult): string {
  const { findings, inventory, durationMs } = result;
  const confirmed = findings.filter((finding) => finding.status === "confirmed");
  const candidates = findings.filter((finding) => finding.status === "candidate");
  const lines = [
    "Coherent audit",
    renderRuntimeIdentity(result.file.runtime),
    `Root: ${inventory.root}`,
    `Files: ${inventory.fileCount}  Findings: ${findings.length} (${confirmed.length} confirmed, ${candidates.length} candidates)`,
    `Scan: ${formatDuration(durationMs)}`,
    result.file.architecturePath
      ? `Architecture: ${result.file.architecturePath}`
      : "Architecture: missing — run `coherent init` before treating this as a full audit.",
    "",
  ];

  const byRule = groupBy(findings, (finding) => finding.ruleId);
  for (const category of CATEGORIES) {
    const rules = RULES.filter((rule) => rule.category === category.id);
    if (!rules.some((rule) => byRule.has(rule.id))) continue;
    lines.push(category.title.toUpperCase());
    for (const rule of rules) {
      const ruleFindings = byRule.get(rule.id);
      if (!ruleFindings) continue;
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
    lines.push("Findings are grouped by category and rule. The coding agent chooses cleanup order.");
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
