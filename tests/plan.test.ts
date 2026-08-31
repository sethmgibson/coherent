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
  it("does not block unrelated concepts behind an analysis-only prerequisite", () => {
    const analysis = finding({
      ruleId: "A01", identity: "billing-boundary", detectionMode: "semantic",
      authoritativeConcept: "Billing", locations: [{ file: "src/billing.ts" }], affectedSymbols: [],
    });
    const cleanup = finding({
      ruleId: "A04", identity: "payment-duplicates", detectionMode: "semantic",
      authoritativeConcept: "Payments", locations: [{ file: "src/payments.ts" }], affectedSymbols: [],
    });
    const plan = buildPlan("/tmp/repo", [analysis, cleanup], { needsReview: new Set() });
    expect(plan.nodes.find((node) => node.ruleIds.includes("A04"))?.prerequisiteNodeIds).toEqual([]);

    const related = buildPlan("/tmp/repo", [analysis, { ...cleanup, authoritativeConcept: "Billing" }], {
      needsReview: new Set(),
    });
    expect(related.nodes.find((node) => node.ruleIds.includes("A04"))?.state).toBe("blocked");
  });

  it("preserves all explicit change risks even after high-confidence confirmation", () => {
    const findings = ["High: changes the public contract.", "Requires a data migration."].map((changeRisk, index) =>
      finding({ ruleId: "A08", identity: `risk-${index}`, status: "confirmed", changeRisk }),
    );
    const plan = buildPlan("/tmp/repo", findings, { needsReview: new Set() });
    expect(plan.nodes).toHaveLength(1);
    for (const item of findings) expect(plan.nodes[0]?.behavioralRisk).toContain(item.changeRisk);
  });

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
    expect(compat?.state).toBe("needs_review");
    expect(selectNextNode(plan)).toBeUndefined();
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

  it("honors explicit finding prerequisites and unlocks across nodes", () => {
    const prerequisite = finding({
      ruleId: "A08",
      identity: "unused:src/old.ts:gone",
      status: "confirmed",
      detectionMode: "deterministic",
      locations: [{ file: "src/old.ts", symbol: "gone" }],
      affectedSymbols: ["gone"],
    });
    const dependent = finding({
      ruleId: "D03",
      identity: "swallowed:src/live.ts:load",
      status: "confirmed",
      detectionMode: "semantic",
      locations: [{ file: "src/live.ts", symbol: "load" }],
      affectedSymbols: ["load"],
      prerequisiteFindingIds: [prerequisite.fingerprint],
      unlocks: "Makes error-boundary cleanup safe.",
    });

    const plan = buildPlan("/tmp/repo", [prerequisite, dependent], {
      needsReview: new Set(),
    });
    const prerequisiteNode = plan.nodes.find((node) =>
      node.findingFingerprints.includes(prerequisite.fingerprint),
    );
    const dependentNode = plan.nodes.find((node) =>
      node.findingFingerprints.includes(dependent.fingerprint),
    );

    expect(prerequisiteNode?.state).toBe("ready");
    expect(dependentNode?.state).toBe("blocked");
    expect(dependentNode?.prerequisiteNodeIds).toEqual([prerequisiteNode?.id]);
    expect(dependentNode?.unlocks).toContain("Makes error-boundary cleanup safe.");
    expect(plan.edges).toContainEqual({
      from: prerequisiteNode?.id,
      to: dependentNode?.id,
      reason: "Prerequisite cleanup should land first.",
    });
  });

  it("does not create a self-dependency when grouped findings reference each other", () => {
    const first = finding({
      ruleId: "A08",
      identity: "unused:src/x.ts:first",
      status: "confirmed",
      detectionMode: "deterministic",
      locations: [{ file: "src/x.ts", symbol: "first" }],
      affectedSymbols: ["first"],
    });
    const second = finding({
      ruleId: "A08",
      identity: "unused:src/x.ts:second",
      status: "confirmed",
      detectionMode: "deterministic",
      locations: [{ file: "src/x.ts", symbol: "second" }],
      affectedSymbols: ["second"],
      prerequisiteFindingIds: [first.fingerprint],
    });

    const plan = buildPlan("/tmp/repo", [first, second]);

    expect(plan.nodes).toHaveLength(1);
    expect(plan.nodes[0]?.prerequisiteNodeIds).toEqual([]);
    expect(plan.nodes[0]?.state).toBe("ready");
    expect(plan.edges).toEqual([]);
  });

  it("treats prerequisite fingerprints absent from the current plan as satisfied", () => {
    const dependent = finding({
      ruleId: "D03",
      identity: "swallowed:src/live.ts:load",
      status: "confirmed",
      detectionMode: "semantic",
      prerequisiteFindingIds: ["resolved-fingerprint"],
    });

    const plan = buildPlan("/tmp/repo", [dependent], {
      needsReview: new Set(),
    });

    expect(plan.nodes[0]?.prerequisiteNodeIds).toEqual([]);
    expect(plan.nodes[0]?.state).toBe("ready");
    expect(plan.edges).toEqual([]);
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
      expect(next?.ruleIds).toContain("A08");
      expect(result.plan.needsReviewNodeIds.length).toBeGreaterThan(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
