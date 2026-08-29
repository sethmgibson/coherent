import type { DoctorResult } from "./types.js";

export function renderDoctor(result: DoctorResult): string {
  const lines = ["Coherent doctor", ""];
  if (result.ok) {
    lines.push("No issues. Decisions, baseline (when present), and discovered architecture look consistent.");
    return `${lines.join("\n")}\n`;
  }
  lines.push(`${result.issues.length} issue(s):`);
  for (const issue of result.issues) {
    lines.push(`  [${issue.code}] ${issue.message}`);
  }
  return `${lines.join("\n")}\n`;
}
