import { describe, expect, it } from "vitest";
import {
  assertUniqueFingerprints,
  mergeFindingsByFingerprint,
} from "../src/audit/dedupe.js";
import { createFinding, type FindingInput } from "../src/domain/finding.js";
import { runAudit } from "../src/audit/run.js";
import { scannerFixture } from "./helpers/audit-fixture.js";

function finding(overrides: Partial<FindingInput> & Pick<FindingInput, "identity">) {
  return createFinding({
    ruleId: "E06",
    title: "Collection .find() inside a loop",
    severity: "medium",
    confidence: "high",
    detectionMode: "hybrid",
    status: "candidate",
    explanation: "test",
    evidence: { summary: ".find() nested under iteration.", details: ["first site"] },
    locations: [{ file: "src/plan/build.ts", symbol: "buildPlan" }],
    affectedSymbols: ["buildPlan", "find"],
    cleanupBenefit: "smaller",
    changeRisk: "review",
    prerequisiteFindingIds: [],
    ...overrides,
  });
}

describe("finding uniqueness", () => {
  it("merges duplicate E06 fingerprints into one finding with occurrence evidence", () => {
    const first = finding({ identity: "loop-find:src/plan/build.ts:buildPlan" });
    const second = finding({
      identity: "loop-find:src/plan/build.ts:buildPlan",
      evidence: { summary: ".find() nested under iteration.", details: ["second site"] },
      locations: [{ file: "src/plan/build.ts", line: 54, symbol: "buildPlan" }],
    });
    expect(first.fingerprint).toBe(second.fingerprint);
    const merged = mergeFindingsByFingerprint([first, second]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.evidence.details?.join("\n")).toMatch(/occurrences: 2/);
    expect(merged[0]?.evidence.details).toEqual(
      expect.arrayContaining(["first site", "second site"]),
    );
    expect(merged[0]?.locations).toHaveLength(2);
    expect(() => assertUniqueFingerprints(merged)).not.toThrow();
    expect(() => assertUniqueFingerprints([first, second])).toThrow(/Duplicate finding fingerprint/);
  });

  it("writes unique fingerprints from a real audit", async () => {
    const { findings } = await runAudit(scannerFixture);
    const fingerprints = findings.map((item) => item.fingerprint);
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
    const loopFind = findings.filter((item) => item.identity.startsWith("loop-find:"));
    expect(loopFind.length).toBeGreaterThan(0);
  });
});
