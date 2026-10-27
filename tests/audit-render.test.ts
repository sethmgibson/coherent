import { beforeAll, describe, expect, it } from "vitest";
import { renderAudit } from "../src/audit/render.js";
import type { AuditResult } from "../src/audit/run.js";
import { auditFixture } from "./helpers/audit-fixture.js";

let audit: AuditResult;
beforeAll(async () => { audit = await auditFixture(); });

describe("audit text", () => {
  it("groups by category and catalog rule order without changing JSON", () => {
    const result = { ...audit, findings: [...audit.findings].reverse() };
    const before = JSON.stringify(result.file);
    const output = renderAudit(result);
    const headings = output.split("\n").filter((line) => /^[A-Z][A-Z ,/-]+$/.test(line));

    expect(headings).toEqual([
      "LEFTOVER STRUCTURE AND REPRESENTATIONS",
      "ACCIDENTAL ARCHITECTURE",
      "DOMAIN AND CONTROL-FLOW DESIGN",
      "FAILURE SEMANTICS, TESTS, AND DEPENDENCIES",
      "PERFORMANCE",
    ]);
    // A03 and A08 belong to the same category but different execution phases.
    const protocols = output.indexOf("  Implicit string protocols:");
    const deadCode = output.indexOf("  Dead code:");
    const nextCategory = output.indexOf("ACCIDENTAL ARCHITECTURE");
    expect(protocols).toBeGreaterThan(0);
    expect(deadCode).toBeGreaterThan(protocols);
    expect(deadCode).toBeLessThan(nextCategory);
    expect(output).toContain("The coding agent chooses cleanup order.");
    expect(output).not.toContain("coherent plan");
    expect(JSON.stringify(result.file)).toBe(before);
    expect(result.findings).toEqual([...audit.findings].reverse());
  });

  it("preserves per-rule counts, evidence, and the display limit", () => {
    const findings = audit.findings.filter((finding) => finding.ruleId === "A08");
    expect(findings.length).toBeGreaterThan(12);
    const confirmed = findings.filter((finding) => finding.status === "confirmed").length;
    const candidates = findings.length - confirmed;
    const output = renderAudit(audit);

    expect(output).toContain(`  Dead code: ${confirmed} confirmed, ${candidates} candidates`);
    for (const finding of findings.slice(0, 12)) {
      expect(output).toContain(`Review id: ${finding.fingerprint.slice(0, 12)}`);
      expect(output).toContain(finding.evidence.summary);
    }
    for (const finding of findings.slice(12)) {
      expect(output).not.toContain(`Review id: ${finding.fingerprint.slice(0, 12)}`);
    }
    expect(output).toContain(`    … ${findings.length - 12} more`);
  });

  it("omits empty categories and reports an empty audit", () => {
    const output = renderAudit({ ...audit, findings: [] });

    expect(output).toContain("Findings: 0 (0 confirmed, 0 candidates)");
    expect(output).toContain("No findings from the implemented detectors.");
    expect(output).not.toContain("LEFTOVER STRUCTURE AND REPRESENTATIONS");
    expect(output).not.toContain("PRODUCT AND WORKFLOW SIMPLIFICATION");
    expect(output).not.toContain("Metrics");
  });
});
