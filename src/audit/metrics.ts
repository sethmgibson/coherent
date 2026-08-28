import { RULES_BY_ID } from "../catalog/rules.js";
import type { Finding } from "../domain/finding.js";

export type MetricKind = "measured" | "inferred";

export interface Metric {
  id: string;
  label: string;
  value: number;
  kind: MetricKind;
  notes?: string;
}

export function computeMetrics(findings: Finding[]): Metric[] {
  const byRule = (id: Finding["ruleId"]) =>
    findings.filter((finding) => finding.ruleId === id);
  const confirmed = (id: Finding["ruleId"]) =>
    byRule(id).filter((finding) => finding.status === "confirmed");
  const competing = competingConcepts(findings);
  const inbound = findings.filter((finding) => finding.ruleId === "C01").length;

  return [
    metric("dead-code-confirmed", "Confirmed dead-code findings", confirmed("A08").length, "measured"),
    metric("dead-code-candidates", "Dead-code candidates", byRule("A08").length - confirmed("A08").length, "measured"),
    metric("stale-compatibility", "Stale compatibility paths", byRule("A07").length, "measured"),
    metric(
      "competing-implementations",
      "Concepts with competing implementations",
      competing,
      "inferred",
      "Counts A04/A05/A06 groups that share an authoritative concept or overlapping symbols.",
    ),
    metric(
      "representations-per-concept",
      "Duplicate-representation pairs",
      byRule("A06").length,
      "inferred",
    ),
    metric("forwarding-wrappers", "Forwarding wrappers", byRule("B04").length, "measured"),
    metric("compatibility-debt", "Compatibility + dual-path findings", byRule("A07").length, "measured"),
    metric("downstream-guards", "Downstream invariant-guard findings", inbound, "inferred"),
    metric("dependency-overlap", "Dependency overlap / unused packages", byRule("D01").length, "measured"),
    metric("swallowed-errors", "Swallowed-error findings", byRule("D03").length, "measured"),
    metric("n-plus-one", "N+1 / redundant query candidates", byRule("E01").length, "inferred"),
    metric("complexity-risks", "Algorithmic complexity candidates", byRule("E06").length, "inferred"),
    metric("confirmed-total", "Confirmed findings", findings.filter((f) => f.status === "confirmed").length, "measured"),
    metric("candidate-total", "Candidate findings", findings.filter((f) => f.status === "candidate").length, "measured"),
    metric(
      "semantic-rules-open",
      "Findings on semantic-mode rules",
      findings.filter((f) => RULES_BY_ID[f.ruleId].detectionMode === "semantic").length,
      "inferred",
    ),
  ];
}

export function renderMetrics(metrics: Metric[]): string {
  const lines = ["Metrics", ""];
  for (const item of metrics) {
    if (item.value === 0) continue;
    const tag = item.kind === "measured" ? "MEASURED" : "INFERRED";
    lines.push(`  [${tag}] ${item.label}: ${item.value}`);
  }
  if (lines.length === 2) lines.push("  No non-zero metrics.");
  return `${lines.join("\n")}\n`;
}

function metric(
  id: string,
  label: string,
  value: number,
  kind: MetricKind,
  notes?: string,
): Metric {
  return notes ? { id, label, value, kind, notes } : { id, label, value, kind };
}

function competingConcepts(findings: Finding[]): number {
  const keys = new Set<string>();
  for (const finding of findings) {
    if (finding.ruleId !== "A04" && finding.ruleId !== "A05" && finding.ruleId !== "A06") {
      continue;
    }
    const key = finding.authoritativeConcept ?? finding.affectedSymbols.slice().sort().join("+");
    if (key) keys.add(key);
  }
  return keys.size;
}
