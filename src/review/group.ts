import type { Finding } from "../domain/finding.js";

export type ReviewQueueGroupBy = "evidence" | "file" | "rule";

/**
 * The narrowest mechanically defensible set that may share one review reason.
 * This deliberately mirrors cleanup grouping without treating an entire rule
 * as one semantic conclusion.
 */
export function reviewGroupKey(finding: Finding): string {
  const file = finding.locations[0]?.file ?? "unknown";
  if (finding.ruleId === "A08") {
    return `${finding.ruleId}:${finding.status}:${file}`;
  }
  if (finding.ruleId === "A07") {
    return `${finding.ruleId}:${file}`;
  }
  if (finding.ruleId === "E05" || finding.ruleId === "E06") {
    const symbol = finding.affectedSymbols[0] ?? finding.identity;
    return `${finding.ruleId}:${file}:${symbol}`;
  }
  return `${finding.ruleId}:${finding.identity}`;
}
