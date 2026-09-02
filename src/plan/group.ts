import type { Finding } from "../domain/finding.js";
import { reviewGroupKey } from "../review/group.js";
import type { FindingGroup } from "./types.js";

export function groupFindings(findings: Finding[]): FindingGroup[] {
  const clusters = new Map<string, Finding[]>();
  for (const finding of findings) {
    const key = reviewGroupKey(finding);
    const list = clusters.get(key) ?? [];
    list.push(finding);
    clusters.set(key, list);
  }

  return [...clusters.entries()].map(([id, group]) => {
    const files = unique(group.flatMap((finding) => finding.locations.map((loc) => loc.file)));
    const symbols = unique(group.flatMap((finding) => finding.affectedSymbols));
    return {
      id,
      ruleIds: unique(group.map((finding) => finding.ruleId)),
      fingerprints: group.map((finding) => finding.fingerprint),
      files,
      symbols,
      reason: groupingReason(group),
    };
  });
}

function groupingReason(group: Finding[]): string {
  const rule = group[0]?.ruleId;
  if (group.length === 1) return "Single finding.";
  if (rule === "A08") return "Dead-code findings in the same file, cleaned together.";
  if (rule === "A07") return "Compatibility signals in the same file, reviewed together.";
  if (rule === "E05" || rule === "E06") {
    return "Performance candidates on the same symbol; deferred until architecture survives.";
  }
  return "Related evidence for one cleanup.";
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
