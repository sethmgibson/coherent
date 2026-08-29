import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DETECTOR_REVISION, FINGERPRINT_VERSION } from "../src/config.js";
import { createFinding, type FindingInput } from "../src/domain/finding.js";
import { applyReviews, classifyReview } from "../src/review/apply.js";
import type { FindingReview } from "../src/review/types.js";
import { readDecisions, upsertReview } from "../src/review/store.js";
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
    fingerprintVersion: FINGERPRINT_VERSION,
    detectorRevision: DETECTOR_REVISION,
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

  it("keeps a same-file A07 node in needs_review when any finding is unreviewed", () => {
    const file = "src/payment.ts";
    const confirmed = finding({
      ruleId: "A07",
      identity: "compat:name:src/payment.ts:legacyHandler",
      title: "Likely compatibility path",
      locations: [{ file, symbol: "legacyHandler" }],
      affectedSymbols: ["legacyHandler"],
    });
    const unreviewedA = finding({
      ruleId: "A07",
      identity: "compat:name:src/payment.ts:oldPaymentPath",
      title: "Likely compatibility path",
      locations: [{ file, symbol: "oldPaymentPath" }],
      affectedSymbols: ["oldPaymentPath"],
    });
    const unreviewedB = finding({
      ruleId: "A07",
      identity: "compat:name:src/payment.ts:compatResolver",
      title: "Likely compatibility path",
      locations: [{ file, symbol: "compatResolver" }],
      affectedSymbols: ["compatResolver"],
    });
    const merged = applyReviews(
      [confirmed, unreviewedA, unreviewedB],
      [review(confirmed, "confirmed")],
      [],
    );
    const plan = buildPlan(".", merged.findings, merged);
    const a07 = plan.nodes.filter((node) => node.ruleIds.includes("A07"));
    expect(a07).toHaveLength(1);
    expect(a07[0]?.findingFingerprints).toHaveLength(3);
    expect(a07[0]?.state).toBe("needs_review");
    expect(selectNextNode(plan)).toBeUndefined();
  });

  it("matches a review by ruleId and identity when the fingerprint is stale", () => {
    const current = finding({
      ruleId: "A06",
      identity: "duplicate-rep:Foo+Bar",
      affectedSymbols: ["Foo", "Bar"],
    });
    const staleFingerprint: FindingReview = {
      fingerprint: "not-the-current-hash",
      ruleId: "A06",
      identity: "duplicate-rep:Foo+Bar",
      decision: "dismissed",
      reason: "intentionally different",
      reviewedAt: "2026-08-28T00:00:00.000Z",
      fingerprintVersion: FINGERPRINT_VERSION,
      detectorRevision: DETECTOR_REVISION,
    };
    const merged = applyReviews([current], [staleFingerprint], []);
    expect(merged.findings).toEqual([]);
  });

  it("does not apply identity fallback when detectorRevision is missing or skewed", () => {
    const current = finding({
      ruleId: "A06",
      identity: "duplicate-rep:Foo+Bar",
      affectedSymbols: ["Foo", "Bar"],
    });
    const missingRevision: FindingReview = {
      fingerprint: "not-the-current-hash",
      ruleId: "A06",
      identity: "duplicate-rep:Foo+Bar",
      decision: "dismissed",
      reason: "intentionally different",
      reviewedAt: "2026-08-28T00:00:00.000Z",
    };
    const skewedRevision: FindingReview = {
      ...missingRevision,
      detectorRevision: DETECTOR_REVISION + 3,
    };
    expect(applyReviews([current], [missingRevision], []).findings).toEqual([current]);
    expect(applyReviews([current], [skewedRevision], []).findings).toEqual([current]);
    expect(classifyReview(missingRevision, [current])).toBe("stale");
    expect(classifyReview(skewedRevision, [current])).toBe("stale");
  });

  it("still applies an exact fingerprint match after a detector revision bump", () => {
    const current = finding({
      ruleId: "A06",
      identity: "duplicate-rep:Foo+Bar",
      affectedSymbols: ["Foo", "Bar"],
    });
    const oldRevision: FindingReview = {
      fingerprint: current.fingerprint,
      ruleId: current.ruleId,
      identity: current.identity,
      decision: "dismissed",
      reason: "intentionally different",
      reviewedAt: "2026-08-28T00:00:00.000Z",
      fingerprintVersion: FINGERPRINT_VERSION,
      detectorRevision: DETECTOR_REVISION - 1,
    };
    expect(applyReviews([current], [oldRevision], []).findings).toEqual([]);
    expect(classifyReview(oldRevision, [current])).toBe("applied");
  });

  it("applies identity fallback across fingerprintVersion churn when detectorRevision matches", () => {
    const current = finding({
      ruleId: "A06",
      identity: "duplicate-rep:Foo+Bar",
      affectedSymbols: ["Foo", "Bar"],
    });
    const churned: FindingReview = {
      fingerprint: "old-hash-algorithm",
      ruleId: "A06",
      identity: "duplicate-rep:Foo+Bar",
      decision: "dismissed",
      reason: "intentionally different",
      reviewedAt: "2026-08-28T00:00:00.000Z",
      fingerprintVersion: FINGERPRINT_VERSION - 1,
      detectorRevision: DETECTOR_REVISION,
    };
    expect(applyReviews([current], [churned], []).findings).toEqual([]);
  });

  it("migrates legacy review and semantic files into decisions.json on the next write", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-decisions-"));
    try {
      const state = join(root, ".coherent");
      await mkdir(state, { recursive: true });
      const semantic = finding({
        ruleId: "A01",
        identity: "fossil:OldLayer",
        detectionMode: "semantic",
        status: "candidate",
      });
      const existingReview = review(semantic, "deferred");
      await writeFile(
        join(state, "reviews.json"),
        `${JSON.stringify({ schemaVersion: 1, reviews: [existingReview] }, null, 2)}\n`,
      );
      await writeFile(
        join(state, "semantic-findings.json"),
        `${JSON.stringify({ schemaVersion: 1, findings: [semantic] }, null, 2)}\n`,
      );

      const replacement = review(semantic, "confirmed");
      await upsertReview(root, replacement);
      const decisions = await readDecisions(root);
      expect(decisions.reviews).toEqual([replacement]);
      expect(decisions.findings).toHaveLength(1);
      expect(decisions.findings[0]?.fingerprint).toBe(semantic.fingerprint);
      expect(JSON.parse(await readFile(join(state, "decisions.json"), "utf8"))).toMatchObject({
        schemaVersion: 1,
        reviews: [{ decision: "confirmed" }],
        findings: [{ identity: "fossil:OldLayer" }],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
