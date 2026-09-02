import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DETECTOR_REVISION,
  detectorRevisionForRule,
  FINGERPRINT_VERSION,
} from "../src/config.js";
import { createFinding, type FindingInput } from "../src/domain/finding.js";
import { applyReviews } from "../src/review/apply.js";
import { parseReviewRequests, runReviewBatch } from "../src/review/run.js";
import { readDecisions, updateDecisions } from "../src/review/store.js";
import type { FindingReview } from "../src/review/types.js";
import { runReviewQueue } from "../src/review/queue.js";
import { buildPlan } from "../src/plan/build.js";
import { renderPlan } from "../src/plan/render.js";

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
    ruleDetectorRevision: detectorRevisionForRule(target.ruleId),
  };
}

describe("review persistence and identity", () => {
  it("keeps both concurrent decision updates under a lock", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-review-lock-"));
    try {
      const state = join(root, ".coherent");
      await mkdir(state, { recursive: true });
      const first = finding({ ruleId: "A01", identity: "fossil:One", detectionMode: "semantic" });
      const second = finding({ ruleId: "A02", identity: "term:Two", detectionMode: "semantic" });
      await writeFile(
        join(state, "decisions.json"),
        `${JSON.stringify({ schemaVersion: 1, reviews: [], findings: [first, second] }, null, 2)}\n`,
      );
      await Promise.all([
        updateDecisions(root, async (current) => {
          await new Promise((resolve) => setTimeout(resolve, 40));
          return { ...current, reviews: [...current.reviews, review(first, "confirmed")] };
        }),
        updateDecisions(root, async (current) => {
          await new Promise((resolve) => setTimeout(resolve, 40));
          return { ...current, reviews: [...current.reviews, review(second, "dismissed")] };
        }),
      ]);
      const decisions = await readDecisions(root);
      expect(decisions.reviews.map((item) => item.identity).sort()).toEqual([
        "fossil:One",
        "term:Two",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refuses identity fallback when two findings share an identity", () => {
    const left = finding({
      ruleId: "B03",
      identity: "single-impl:DashboardReadModel",
      locations: [{ file: "src/dash-a.ts", symbol: "DashboardReadModel" }],
      affectedSymbols: ["DashboardReadModel", "Sql"],
    });
    const right = finding({
      ruleId: "B03",
      identity: "single-impl:DashboardReadModel",
      locations: [{ file: "src/dash-b.ts", symbol: "DashboardReadModel" }],
      affectedSymbols: ["DashboardReadModel", "Memory"],
    });
    const stale: FindingReview = {
      ...review(left, "confirmed"),
      fingerprint: "not-the-current-hash",
    };
    const merged = applyReviews([left, right], [stale], []);
    expect(merged.findings.map((item) => item.status)).toEqual(["candidate", "candidate"]);
    expect(merged.needsReview.size).toBe(2);
  });

  it("does not let Refund and refund share a review identity fallback", () => {
    const refund = finding({
      ruleId: "A03",
      identity: "string-protocol:kind:Refund",
      affectedSymbols: ["Refund"],
    });
    const refundLower = finding({
      ruleId: "A03",
      identity: "string-protocol:kind:refund",
      affectedSymbols: ["refund"],
    });
    const merged = applyReviews(
      [refund, refundLower],
      [{ ...review(refund, "confirmed"), fingerprint: "stale-hash" }],
      [],
    );
    expect(merged.findings.find((item) => item.affectedSymbols.includes("Refund"))?.status).toBe(
      "confirmed",
    );
    expect(merged.findings.find((item) => item.affectedSymbols.includes("refund"))?.status).toBe(
      "candidate",
    );
  });

  it("persists batch semanticEquivalence and rejects unknown fields", async () => {
    const parsed = parseReviewRequests([
      {
        fingerprint: "abc",
        decision: "dismissed",
        reason: "Share fields by coincidence. Taxonomy grouping is not a cleanup phase.",
        semanticEquivalence: "Intentionally different; do not merge.",
        authoritativeConcept: "Keep both.",
      },
    ]);
    expect(parsed[0]?.semanticEquivalence).toBe("Intentionally different; do not merge.");
    expect(parsed[0]?.authoritativeConcept).toBe("Keep both.");
    expect(() =>
      parseReviewRequests([
        {
          fingerprint: "abc",
          decision: "dismissed",
          reason: "ok",
          extraField: "dropped-in-old-parser",
        },
      ]),
    ).toThrow(/unknown field/i);

    const root = await mkdtemp(join(tmpdir(), "coherent-review-meta-"));
    try {
      const state = join(root, ".coherent");
      await mkdir(state, { recursive: true });
      const target = finding({
        ruleId: "A06",
        identity: "duplicate-rep:Foo+Bar",
        detectionMode: "semantic",
      });
      await writeFile(
        join(state, "decisions.json"),
        `${JSON.stringify({ schemaVersion: 1, reviews: [], findings: [target] }, null, 2)}\n`,
      );
      const applied = await runReviewBatch(root, [
        {
          fingerprint: target.fingerprint,
          decision: "dismissed",
          reason: "Share fields by coincidence. Taxonomy grouping is not a cleanup phase.",
          semanticEquivalence: "Intentionally different; do not merge.",
          authoritativeConcept: "Keep both.",
        },
      ]);
      expect(applied.reviews[0]?.semanticEquivalence).toBe("Intentionally different; do not merge.");
      expect(applied.receipt.reviews[0]?.semanticEquivalence).toBe(
        "Intentionally different; do not merge.",
      );
      const stored = JSON.parse(await readFile(join(state, "decisions.json"), "utf8")) as {
        reviews: FindingReview[];
      };
      expect(stored.reviews[0]?.semanticEquivalence).toBe("Intentionally different; do not merge.");
      expect(stored.reviews[0]?.authoritativeConcept).toBe("Keep both.");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("previews apply without writing and returns exact targets", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-review-dry-"));
    try {
      const state = join(root, ".coherent");
      await mkdir(state, { recursive: true });
      const target = finding({
        ruleId: "A01",
        identity: "fossil:Layer",
        detectionMode: "semantic",
      });
      await writeFile(
        join(state, "decisions.json"),
        `${JSON.stringify({ schemaVersion: 1, reviews: [], findings: [target] }, null, 2)}\n`,
      );
      const preview = await runReviewBatch(
        root,
        [
          {
            fingerprint: target.fingerprint,
            decision: "confirmed",
            reason: "The layer has no remaining consumer and duplicates BillingPort.",
          },
        ],
        { dryRun: true },
      );
      expect(preview.receipt.dryRun).toBe(true);
      expect(preview.receipt.wrote).toBe(false);
      expect(preview.receipt.targets).toEqual([
        {
          fingerprint: target.fingerprint,
          identity: target.identity,
          ruleId: "A01",
          title: target.title,
          reviewGroupKey: `A01:${target.identity}`,
        },
      ]);
      expect(preview.receipt.groups).toEqual([
        {
          reviewGroupKey: `A01:${target.identity}`,
          ruleId: "A01",
          count: 1,
          files: ["src/a.ts"],
        },
      ]);
      expect((await readDecisions(root)).reviews).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects phase-only deferrals and architecture-only dismissals", () => {
    expect(() =>
      parseReviewRequests([
        {
          fingerprint: "abc",
          decision: "deferred",
          reason: "Phase 8; architecture hasn't settled",
        },
      ]),
    ).not.toThrow();
    expect(() =>
      parseReviewRequests([
        {
          fingerprint: "abc",
          decision: "deferred",
          reason: "Phase 8; architecture hasn't settled",
          missingEvidence: "Need the payment port named.",
          reconsiderWhen: "After ARCHITECTURE.md names the payment port.",
        },
      ]),
    ).not.toThrow();
  });

  it("requires deferral conditions when applying a deferred review", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-review-defer-"));
    try {
      const state = join(root, ".coherent");
      await mkdir(state, { recursive: true });
      const target = finding({
        ruleId: "A01",
        identity: "fossil:Layer",
        detectionMode: "semantic",
      });
      await writeFile(
        join(state, "decisions.json"),
        `${JSON.stringify({ schemaVersion: 1, reviews: [], findings: [target] }, null, 2)}\n`,
      );
      await expect(
        runReviewBatch(root, [
          {
            fingerprint: target.fingerprint,
            decision: "deferred",
            reason: "Phase 8; architecture hasn't settled",
          },
        ]),
      ).rejects.toThrow(/missingEvidence or reconsiderWhen|phase number/i);
      const applied = await runReviewBatch(root, [
        {
          fingerprint: target.fingerprint,
          decision: "deferred",
          reason: "Need the remaining consumer named before collapsing this layer.",
          missingEvidence: "No named caller of OldLayer remains in the inventory.",
          reconsiderWhen: "After the next audit that lists OldLayer callers.",
        },
      ]);
      expect(applied.reviews[0]?.missingEvidence).toMatch(/caller/);
      expect(applied.reviews[0]?.reconsiderWhen).toMatch(/next audit/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps deferred items out of NEEDS REVIEW and shows the reason", () => {
    const target = finding({
      ruleId: "A06",
      identity: "duplicate-rep:Foo+Bar",
      affectedSymbols: ["Foo", "Bar"],
    });
    const deferredReview: FindingReview = {
      ...review(target, "deferred"),
      missingEvidence: "Need the persistence owner named.",
      reconsiderWhen: "After the billing schema lands.",
    };
    const merged = applyReviews([target], [deferredReview], []);
    expect(merged.needsReview.has(target.fingerprint)).toBe(false);
    expect(merged.deferred.has(target.fingerprint)).toBe(true);
      const plan = buildPlan(".", merged.findings, { ...merged, reviews: [deferredReview] });
      expect(plan.nodes[0]?.state).toBe("deferred");
      expect(plan.terminalState).toBe("deferred_only");
    const rendered = renderPlan(plan);
    expect(rendered).toMatch(/DEFERRED/);
    expect(rendered).not.toMatch(/NEEDS REVIEW/);
    expect(rendered).toMatch(/Need the persistence owner named/);
    expect(rendered).toMatch(/After the billing schema lands/);
  });
});

describe("review queue", () => {
  it("separates unreviewed, deferred, and ready items", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-review-queue-"));
    try {
      const state = join(root, ".coherent");
      await mkdir(state, { recursive: true });
      const unreviewed = finding({
        ruleId: "A01",
        identity: "fossil:Open",
        detectionMode: "semantic",
      });
      const unreviewedPeer = finding({
        ruleId: "A01",
        identity: "fossil:Second",
        detectionMode: "semantic",
      });
      const deferred = finding({
        ruleId: "A02",
        identity: "term:Hold",
        detectionMode: "semantic",
      });
      const ready = finding({
        ruleId: "A04",
        identity: "dup:Done",
        detectionMode: "semantic",
      });
      await writeFile(
        join(state, "decisions.json"),
        `${JSON.stringify({
          schemaVersion: 1,
          reviews: [
            {
              ...review(deferred, "deferred"),
              missingEvidence: "Need the glossary owner.",
              reconsiderWhen: "After terminology is confirmed.",
            },
            review(ready, "confirmed"),
          ],
          findings: [unreviewed, unreviewedPeer, deferred, ready],
        }, null, 2)}\n`,
      );
      const queue = await runReviewQueue(root, { limit: 1, groupBy: "rule" });
      expect(queue.counts.unreviewed).toBeGreaterThanOrEqual(1);
      expect(queue.counts.deferred).toBeGreaterThanOrEqual(1);
      expect(queue.counts.ready).toBeGreaterThanOrEqual(1);
      expect(queue.groups.some((group) => group.state === "deferred")).toBe(true);
      expect(queue.groups.some((group) => group.state === "unreviewed")).toBe(true);
      const group = queue.groups.find(
        (item) => item.state === "unreviewed" && item.ruleId === "A01",
      );
      expect(group).toMatchObject({ total: 2, shown: 1, truncated: true });
      expect(group?.items).toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("defaults to evidence groups and labels unreviewed performance heuristics advisory", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-review-queue-evidence-"));
    try {
      const state = join(root, ".coherent");
      await mkdir(state, { recursive: true });
      const first = finding({
        ruleId: "A01",
        identity: "fossil:One",
        detectionMode: "semantic",
      });
      const second = finding({
        ruleId: "A01",
        identity: "fossil:Two",
        detectionMode: "semantic",
      });
      const advisory = finding({
        ruleId: "E06",
        identity: "complexity:hot",
        detectionMode: "hybrid",
        locations: [{ file: "src/hot.ts", symbol: "scan" }],
        affectedSymbols: ["scan"],
      });
      await writeFile(
        join(state, "decisions.json"),
        `${JSON.stringify({
          schemaVersion: 1,
          reviews: [],
          findings: [first, second, advisory],
        }, null, 2)}\n`,
      );
      const queue = await runReviewQueue(root);
      expect(queue.counts.unreviewed).toBe(2);
      expect(queue.counts.advisory).toBe(1);
      expect(queue.groups.every((group) => group.groupBy === "evidence")).toBe(true);
      expect(queue.groups.filter((group) => group.state === "unreviewed")).toHaveLength(2);
      expect(queue.groups.find((group) => group.state === "advisory")?.items).toEqual([
        expect.objectContaining({
          fingerprint: advisory.fingerprint,
          reviewGroupKey: "E06:src/hot.ts:scan",
        }),
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
