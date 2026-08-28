import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runAudit } from "../../src/audit/run.js";
import type { Finding } from "../../src/domain/finding.js";

export const scannerFixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "scanner-app",
);

export async function auditFixture(root = scannerFixture) {
  return runAudit(root);
}

export function byRule(findings: Finding[], ruleId: Finding["ruleId"]): Finding[] {
  return findings.filter((finding) => finding.ruleId === ruleId);
}

export function hasSymbol(findings: Finding[], symbol: string): boolean {
  return findings.some((finding) => finding.affectedSymbols.includes(symbol));
}

export function findingFor(findings: Finding[], symbol: string): Finding | undefined {
  return findings.find((finding) => finding.affectedSymbols.includes(symbol));
}
