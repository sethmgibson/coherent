import { describe, expect, it } from "vitest";
import {
  createFinding,
  fingerprintFinding,
  parseFinding,
  serializeFinding,
  type FindingInput,
} from "../src/domain/finding.js";

function sample(overrides: Partial<FindingInput> = {}): FindingInput {
  return {
    ruleId: "A08",
    title: "Unused export",
    identity: "unused-export:oldHelper",
    severity: "medium",
    confidence: "high",
    detectionMode: "deterministic",
    status: "confirmed",
    explanation: "No remaining static references.",
    evidence: { summary: "export never imported", details: ["src/legacy.ts"] },
    locations: [{ file: "src/legacy.ts", line: 4, column: 1, symbol: "oldHelper" }],
    affectedSymbols: ["oldHelper"],
    cleanupBenefit: "Removes a misleading API.",
    changeRisk: "Low if no dynamic import.",
    prerequisiteFindingIds: [],
    ...overrides,
  };
}

describe("finding fingerprint", () => {
  it("is stable for the same identifying fields", () => {
    const first = fingerprintFinding(sample());
    const second = fingerprintFinding(sample());
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toBe(second);
  });

  it("ignores explanation and severity changes", () => {
    const base = fingerprintFinding(sample());
    const changed = fingerprintFinding(
      sample({
        explanation: "Different write-up",
        severity: "low",
        confidence: "low",
      }),
    );
    expect(changed).toBe(base);
  });

  it("ignores title, line, and column so baselines survive edits", () => {
    const base = fingerprintFinding(sample());
    expect(fingerprintFinding(sample({ title: "Other unused export" }))).toBe(
      base,
    );
    expect(
      fingerprintFinding(
        sample({
          locations: [{ file: "src/legacy.ts", line: 40, column: 8, symbol: "oldHelper" }],
        }),
      ),
    ).toBe(base);
  });

  it("changes when identity, file, or symbol changes", () => {
    const base = fingerprintFinding(sample());
    expect(fingerprintFinding(sample({ identity: "unused-local:oldHelper" }))).not.toBe(
      base,
    );
    expect(
      fingerprintFinding(sample({ locations: [{ file: "src/other.ts" }] })),
    ).not.toBe(base);
    expect(fingerprintFinding(sample({ affectedSymbols: ["other"] }))).not.toBe(
      base,
    );
  });

  it("does not depend on location order", () => {
    const a = fingerprintFinding(
      sample({
        locations: [
          { file: "src/a.ts", line: 1 },
          { file: "src/b.ts", line: 2 },
        ],
      }),
    );
    const b = fingerprintFinding(
      sample({
        locations: [
          { file: "src/b.ts", line: 2 },
          { file: "src/a.ts", line: 1 },
        ],
      }),
    );
    expect(a).toBe(b);
  });
});

describe("finding serialization", () => {
  it("round-trips through JSON with a computed fingerprint", () => {
    const finding = createFinding(sample({ authoritativeConcept: "Helper" }));
    const parsed = parseFinding(serializeFinding(finding));
    expect(parsed).toEqual(finding);
    expect(parsed.fingerprint).toBe(fingerprintFinding(sample({ authoritativeConcept: "Helper" })));
  });

  it("rejects invalid JSON payloads", () => {
    expect(() => parseFinding("{}")).toThrow(/Invalid finding/);
    expect(() => parseFinding("null")).toThrow(/Invalid finding/);
  });
});
