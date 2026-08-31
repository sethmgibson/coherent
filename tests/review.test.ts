import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { artifactVersions, DETECTOR_REVISION, FINGERPRINT_VERSION } from "../src/config.js";
import { createFinding, type FindingInput } from "../src/domain/finding.js";
import { applyReviews, classifyReview } from "../src/review/apply.js";
import { validateReviewLifecycle } from "../src/review/lifecycle.js";
import type { FindingReview } from "../src/review/types.js";
import { readDecisions, upsertReview } from "../src/review/store.js";
import { parseReviewRequests, runReviewBatch, runReviewPrune } from "../src/review/run.js";
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

  it("invalidates an exact mechanical fingerprint after a detector revision bump", () => {
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
    expect(applyReviews([current], [oldRevision], []).findings).toEqual([current]);
    expect(classifyReview(oldRevision, [current])).toBe("stale");
  });

  it("keeps exact semantic reviews independent of detector revisions", () => {
    const current = finding({
      ruleId: "A01",
      identity: "fossil:OldLayer",
      detectionMode: "semantic",
    });
    const oldRevision: FindingReview = {
      ...review(current, "dismissed"),
      detectorRevision: DETECTOR_REVISION - 1,
    };
    expect(applyReviews([], [oldRevision], [current]).findings).toEqual([]);
    expect(classifyReview(oldRevision, [current])).toBe("applied");
  });

  it("reopens compatibility findings when their review lifecycle is missing or expired", () => {
    const current = finding({
      ruleId: "A07",
      identity: "compat:name:src/legacy.ts:oldMode",
      detectionMode: "semantic",
    });
    const missing = review(current, "dismissed");
    const milestone: FindingReview = {
      ...missing,
      removalMilestone: "Remove after the v1 client migration.",
    };
    const expired: FindingReview = {
      ...missing,
      expiresAt: "2020-01-01T00:00:00.000Z",
    };
    const future: FindingReview = {
      ...missing,
      expiresAt: "2099-01-01T00:00:00.000Z",
    };
    const falsePositive: FindingReview = {
      ...missing,
      notCompatibility: true,
    };

    expect(applyReviews([], [missing], [current]).findings).toEqual([current]);
    expect(classifyReview(missing, [current])).toBe("stale");
    expect(applyReviews([], [milestone], [current]).findings).toEqual([]);
    expect(applyReviews([], [expired], [current]).findings).toEqual([current]);
    expect(classifyReview(expired, [current])).toBe("stale");
    expect(applyReviews([], [future], [current]).findings).toEqual([]);
    expect(applyReviews([], [falsePositive], [current]).findings).toEqual([]);
    expect(classifyReview(falsePositive, [current])).toBe("applied");
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

  it("applies a batch atomically with one decisions write", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-review-batch-"));
    try {
      const state = join(root, ".coherent");
      await mkdir(state, { recursive: true });
      const first = finding({
        ruleId: "A01",
        identity: "fossil:One",
        detectionMode: "semantic",
      });
      const second = finding({
        ruleId: "A02",
        identity: "term:Two",
        detectionMode: "semantic",
      });
      await writeFile(
        join(state, "decisions.json"),
        `${JSON.stringify({ schemaVersion: 1, reviews: [], findings: [first, second] }, null, 2)}\n`,
      );

      const requests = parseReviewRequests([
        {
          fingerprint: first.fingerprint.slice(0, 12),
          decision: "confirmed",
          reason: "Confirmed together.",
        },
        {
          fingerprint: second.fingerprint.slice(0, 12),
          decision: "deferred",
          reason: "Needs owner input.",
        },
      ]);
      const applied = await runReviewBatch(root, requests);
      expect(applied.reviews.map((item) => item.decision)).toEqual(["confirmed", "deferred"]);
      const beforeFailure = await readFile(join(state, "decisions.json"), "utf8");

      await expect(
        runReviewBatch(root, [
          {
            fingerprint: first.fingerprint,
            decision: "dismissed",
            reason: "Would be valid alone.",
          },
          {
            fingerprint: "missing-fingerprint",
            decision: "dismissed",
            reason: "Invalid target.",
          },
        ]),
      ).rejects.toThrow(/No finding/);
      expect(await readFile(join(state, "decisions.json"), "utf8")).toBe(beforeFailure);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("validates batch review input before scanning", () => {
    expect(() => parseReviewRequests({})).toThrow(/JSON array/);
    expect(() =>
      parseReviewRequests([{ fingerprint: "abc", decision: "dismissed", reason: "" }]),
    ).toThrow(/missing reason/);
    expect(() => parseReviewRequests([{
      fingerprint: "abc",
      decision: "dismissed",
      reason: "Has an invalid expiry.",
      expiresAt: "next release",
    }])).toThrow(/ISO date or timestamp/);
  });

  it("validates compatibility lifecycle scope and expiry", () => {
    const now = Date.parse("2026-08-29T00:00:00.000Z");
    expect(() => validateReviewLifecycle("A07", "dismissed", {}, now))
      .toThrow(/require expiresAt or removalMilestone/);
    expect(() => validateReviewLifecycle(
      "A07",
      "deferred",
      { expiresAt: "2026-08-28" },
      now,
    )).toThrow(/must be in the future/);
    expect(() => validateReviewLifecycle(
      "A07",
      "dismissed",
      { expiresAt: "2026-09-01" },
      now,
    )).not.toThrow();
    expect(() => validateReviewLifecycle(
      "A01",
      "dismissed",
      { removalMilestone: "Remove after v1." },
      now,
    )).toThrow(/only valid for A07/);
    expect(() => validateReviewLifecycle(
      "A07",
      "dismissed",
      { notCompatibility: true },
      now,
    )).not.toThrow();
    expect(() => validateReviewLifecycle(
      "A07",
      "deferred",
      { notCompatibility: true },
      now,
    )).toThrow(/only valid when dismissing/);
    expect(() => validateReviewLifecycle("A07", "confirmed", {}, now)).not.toThrow();
  });

  it("requires lifecycle metadata when dismissing or deferring compatibility", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-review-lifecycle-"));
    try {
      const state = join(root, ".coherent");
      await mkdir(state, { recursive: true });
      const compatibility = finding({
        ruleId: "A07",
        identity: "compat:name:src/legacy.ts:oldMode",
        detectionMode: "semantic",
      });
      await writeFile(
        join(state, "decisions.json"),
        `${JSON.stringify({ schemaVersion: 1, reviews: [], findings: [compatibility] }, null, 2)}\n`,
      );

      await expect(runReviewBatch(root, [{
        fingerprint: compatibility.fingerprint,
        decision: "dismissed",
        reason: "A real client still uses this path.",
      }])).rejects.toThrow(/require expiresAt or removalMilestone/);

      const applied = await runReviewBatch(root, [{
        fingerprint: compatibility.fingerprint,
        decision: "dismissed",
        reason: "A real client still uses this path.",
        removalMilestone: "Remove after the v1 client migration.",
      }]);
      expect(applied.reviews[0]?.removalMilestone).toBe(
        "Remove after the v1 client migration.",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("expands one grouped batch decision across several fingerprints", () => {
    const requests = parseReviewRequests([
      {
        fingerprints: ["aaa", "bbb"],
        decision: "dismissed",
        reason: "One reviewed compatibility path.",
        removalMilestone: "Remove after the client migration.",
      },
    ]);
    expect(requests).toEqual([
      {
        fingerprint: "aaa",
        decision: "dismissed",
        reason: "One reviewed compatibility path.",
        removalMilestone: "Remove after the client migration.",
      },
      {
        fingerprint: "bbb",
        decision: "dismissed",
        reason: "One reviewed compatibility path.",
        removalMilestone: "Remove after the client migration.",
      },
    ]);
    expect(() => parseReviewRequests([{
      fingerprint: "aaa",
      fingerprints: ["bbb"],
      decision: "dismissed",
      reason: "ambiguous",
    }])).toThrow(/not both/);
  });

  it("previews review pruning and preserves current or baseline-backed history", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-review-prune-"));
    try {
      const state = join(root, ".coherent");
      await mkdir(state, { recursive: true });
      const current = finding({
        ruleId: "A01",
        identity: "fossil:Current",
        detectionMode: "semantic",
      });
      const resolved: FindingReview = {
        ...review(current, "confirmed"),
        fingerprint: "resolved-fingerprint",
        identity: "fossil:Resolved",
      };
      const orphan: FindingReview = {
        ...review(current, "dismissed"),
        fingerprint: "orphan-fingerprint",
        identity: "fossil:Orphan",
      };
      const expired: FindingReview = {
        ...review(current, "dismissed"),
        fingerprint: "expired-fingerprint",
        ruleId: "A07",
        identity: "compat:name:src/old.ts:legacyClient",
        expiresAt: "2020-01-01T00:00:00.000Z",
      };
      await writeFile(
        join(state, "decisions.json"),
        `${JSON.stringify({
          schemaVersion: 1,
          reviews: [review(current, "dismissed"), resolved, orphan, expired],
          findings: [current],
        }, null, 2)}\n`,
      );
      await writeFile(
        join(state, "baseline.json"),
        `${JSON.stringify({
          ...artifactVersions(),
          createdAt: "2026-01-01T00:00:00.000Z",
          findings: [
            {
              fingerprint: resolved.fingerprint,
              ruleId: "A01",
              identity: resolved.identity,
              title: "Resolved fossil",
              detectionMode: "semantic",
              status: "confirmed",
              severity: "medium",
              files: ["src/old.ts"],
              symbols: ["Resolved"],
            },
            {
              fingerprint: expired.fingerprint,
              ruleId: "A07",
              identity: expired.identity,
              title: "Expired compatibility path",
              detectionMode: "hybrid",
              status: "candidate",
              severity: "medium",
              files: ["src/old.ts"],
              symbols: ["legacyClient"],
            },
          ],
        }, null, 2)}\n`,
      );

      const preview = await runReviewPrune(root);
      expect(preview.removable.map((item) => item.identity)).toEqual([
        "fossil:Orphan",
        "compat:name:src/old.ts:legacyClient",
      ]);
      expect((await readDecisions(root)).reviews).toHaveLength(4);

      const applied = await runReviewPrune(root, true);
      expect(applied.wrote).toBe(true);
      expect((await readDecisions(root)).reviews.map((item) => item.identity).sort()).toEqual([
        "fossil:Current",
        "fossil:Resolved",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
