import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createFinding, type FindingInput } from "../src/domain/finding.js";
import { buildPlan } from "../src/plan/build.js";
import { selectNextNode } from "../src/fix/select.js";
import { runPlan } from "../src/plan/run.js";
import { scannerFixture } from "./helpers/audit-fixture.js";

function finding(overrides: Partial<FindingInput> & Pick<FindingInput, "ruleId" | "identity">) {
  return createFinding({
    title: overrides.title ?? overrides.ruleId,
    severity: "medium",
    confidence: "high",
    detectionMode: "hybrid",
    status: "candidate",
    explanation: "test",
    evidence: { summary: "test" },
    locations: [{ file: "src/a.ts", symbol: "foo" }],
    affectedSymbols: ["foo"],
    cleanupBenefit: "smaller",
    changeRisk: "review",
    prerequisiteFindingIds: [],
    ...overrides,
  });
}

describe("cleanup DAG", () => {
  it("does not sort by rule ID and prefers high-confidence A08 over semantic A01", () => {
    const findings = [
      finding({
        ruleId: "A01",
        identity: "fossil",
        title: "Fossil layer",
        severity: "high",
        detectionMode: "semantic",
        status: "candidate",
        confidence: "medium",
        locations: [{ file: "src/legacy.ts", symbol: "OldLayer" }],
        affectedSymbols: ["OldLayer"],
      }),
      finding({
        ruleId: "A08",
        identity: "unused:src/dead.ts:gone",
        title: "Unused internal declaration",
        severity: "high",
        detectionMode: "deterministic",
        status: "confirmed",
        confidence: "high",
        locations: [{ file: "src/dead.ts", symbol: "gone" }],
        affectedSymbols: ["gone"],
        changeRisk: "Low if no reflection.",
      }),
    ];
    const plan = buildPlan("/tmp/repo", findings);
    const next = selectNextNode(plan);
    expect(next?.ruleIds).toContain("A08");
    expect(next?.state).toBe("ready");
    const a08 = plan.nodes.find((node) => node.ruleIds.includes("A08"));
    const a01 = plan.nodes.find((node) => node.ruleIds.includes("A01"));
    expect(a08?.priorityScore ?? 0).toBeGreaterThan(a01?.priorityScore ?? 0);
  });

  it("prefers unused-export A08 candidates over unconfirmed A06 pairs", () => {
    const findings = [
      finding({
        ruleId: "A06",
        identity: "duplicate-rep:Foo+Bar",
        title: "Structurally similar representations",
        locations: [{ file: "src/types.ts", symbol: "Foo" }],
        affectedSymbols: ["Foo", "Bar"],
      }),
      finding({
        ruleId: "A08",
        identity: "unused-candidate:src/util.ts:helper",
        title: "Possibly unused export or registration",
        detectionMode: "deterministic",
        status: "candidate",
        confidence: "medium",
        locations: [{ file: "src/util.ts", symbol: "helper" }],
        affectedSymbols: ["helper"],
        changeRisk: "Do not delete without confirming public, DI, CLI, or dynamic reachability.",
      }),
    ];
    const next = selectNextNode(buildPlan("/tmp/repo", findings));
    expect(next?.ruleIds).toContain("A08");
  });

  it("records A07 → A08 re-scan and does not treat phases as a rigid list", () => {
    const findings = [
      finding({
        ruleId: "A07",
        identity: "compat:src/pay.ts:legacyLoad",
        locations: [{ file: "src/pay.ts", symbol: "legacyLoad" }],
        affectedSymbols: ["legacyLoad"],
        evidence: { summary: "compat", details: ["No internal callers were found (still not proof of obsolescence)."] },
      }),
      finding({
        ruleId: "E06",
        identity: "loop-filter:src/pay.ts:legacyLoad",
        locations: [{ file: "src/pay.ts", symbol: "legacyLoad" }],
        affectedSymbols: ["legacyLoad"],
      }),
    ];
    const plan = buildPlan("/tmp/repo", findings);
    const compat = plan.nodes.find((node) => node.ruleIds.includes("A07"));
    expect(compat?.rescanAfter).toContain("A08");
    expect(compat?.mayResolveIndirectly.length).toBeGreaterThan(0);
    const next = selectNextNode(plan);
    expect(next?.ruleIds).toContain("A07");
  });

  it("groups same-file A08 findings into one node", () => {
    const findings = [
      finding({
        ruleId: "A08",
        identity: "unused:src/x.ts:a",
        status: "confirmed",
        detectionMode: "deterministic",
        locations: [{ file: "src/x.ts", symbol: "a" }],
        affectedSymbols: ["a"],
      }),
      finding({
        ruleId: "A08",
        identity: "unused:src/x.ts:b",
        status: "confirmed",
        detectionMode: "deterministic",
        locations: [{ file: "src/x.ts", symbol: "b" }],
        affectedSymbols: ["b"],
      }),
    ];
    const plan = buildPlan("/tmp/repo", findings);
    const a08 = plan.nodes.filter((node) => node.ruleIds.includes("A08"));
    expect(a08).toHaveLength(1);
    expect(a08[0]?.findingFingerprints).toHaveLength(2);
  });

  it("builds a plan from the scanner fixture", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-plan-fx-"));
    try {
      const { cp } = await import("node:fs/promises");
      await cp(scannerFixture, root, { recursive: true });
      const result = await runPlan(root);
      expect(result.plan.nodes.length).toBeGreaterThan(0);
      expect(result.plan.readyNodeIds.length).toBeGreaterThan(0);
      const next = selectNextNode(result.plan);
      expect(next).toBeDefined();
      expect(next?.state).toBe("ready");
      const firstRules = result.plan.nodes[0]?.ruleIds ?? [];
      expect(firstRules.some((id) => ["A08", "A07", "B04", "D03", "D01"].includes(id))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
