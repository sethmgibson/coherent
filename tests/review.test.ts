import { describe, expect, it } from "vitest";
import { createFinding, type FindingInput } from "../src/domain/finding.js";
import { applyReviews } from "../src/review/apply.js";
import type { FindingReview } from "../src/review/types.js";
import { buildPlan } from "../src/plan/build.js";
import { selectNextNode } from "../src/fix/select.js";

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

function review(
  target: ReturnType<typeof finding>,
  decision: FindingReview["decision"],
): FindingReview {
  return {
    fingerprint: target.fingerprint,
    ruleId: target.ruleId,
    identity: target.identity,
    decision,
    reason: `${decision} in test`,
    reviewedAt: "2026-08-28T00:00:00.000Z",
  };
}

describe("review merge into plan", () => {
  it("drops a dismissed A06 and leaves unreviewed hybrid as needs_review", () => {
    const a06 = finding({
      ruleId: "A06",
      identity: "duplicate-rep:CleanupPhase+RuleCategory",
      title: "Structurally similar representations",
      affectedSymbols: ["CleanupPhase", "RuleCategory"],
    });
    const unused = finding({
      ruleId: "A08",
      identity: "unused-candidate:src/util.ts:helper",
      title: "Possibly unused export",
      detectionMode: "deterministic",
      status: "candidate",
      confidence: "medium",
      locations: [{ file: "src/util.ts", symbol: "helper" }],
      affectedSymbols: ["helper"],
    });
    const merged = applyReviews([a06, unused], [review(a06, "dismissed")], []);
    expect(merged.findings.map((item) => item.ruleId)).toEqual(["A08"]);

    const leftover = finding({
      ruleId: "A06",
      identity: "duplicate-rep:Foo+Bar",
      affectedSymbols: ["Foo", "Bar"],
    });
    const pending = applyReviews([leftover, unused], [], []);
    const plan = buildPlan(".", pending.findings, pending);
    expect(plan.nodes.find((node) => node.ruleIds.includes("A06"))?.state).toBe("needs_review");
    expect(selectNextNode(plan)?.ruleIds).toContain("A08");
  });

  it("promotes a confirmed hybrid and a confirmed semantic-only finding to plan nodes", () => {
    const hybrid = finding({
      ruleId: "A06",
      identity: "duplicate-rep:User+UserDto",
      affectedSymbols: ["User", "UserDto"],
    });
    const semantic = finding({
      ruleId: "A01",
      identity: "fossil:OldLayer",
      title: "Fossil layer",
      detectionMode: "semantic",
      locations: [{ file: "src/legacy.ts", symbol: "OldLayer" }],
      affectedSymbols: ["OldLayer"],
    });
    const merged = applyReviews(
      [hybrid],
      [review(hybrid, "confirmed"), review(semantic, "confirmed")],
      [semantic],
    );
    const plan = buildPlan(".", merged.findings, merged);
    expect(plan.nodes.some((node) => node.ruleIds.includes("A06") && node.state === "ready")).toBe(
      true,
    );
    expect(plan.nodes.some((node) => node.ruleIds.includes("A01") && node.state === "ready")).toBe(
      true,
    );
  });

  it("matches a review by ruleId and identity when the fingerprint is stale", () => {
    const current = finding({
      ruleId: "A06",
      identity: "duplicate-rep:Foo+Bar",
      affectedSymbols: ["Foo", "Bar"],
    });
    const stale: FindingReview = {
      fingerprint: "not-the-current-hash",
      ruleId: "A06",
      identity: "duplicate-rep:Foo+Bar",
      decision: "dismissed",
      reason: "intentionally different",
      reviewedAt: "2026-08-28T00:00:00.000Z",
    };
    const merged = applyReviews([current], [stale], []);
    expect(merged.findings).toEqual([]);
  });
});
