import { describe, expect, it } from "vitest";
import {
  createFinding,
  fingerprintFinding,
  parseFinding,
  parseFindingInput,
  serializeFinding,
  type FindingInput,
} from "../src/domain/finding.js";
import { parseSemanticFindingsFile } from "../src/review/store.js";

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
    expect(() =>
      parseFinding(JSON.stringify({ ruleId: "A01", fingerprint: "invented", locations: [] })),
    ).toThrow(/Invalid finding/);
  });

  it("rejects a serialized fingerprint that does not match the canonical identity", () => {
    const finding = createFinding(sample());
    expect(() =>
      parseFinding(JSON.stringify({ ...finding, fingerprint: "invented" })),
    ).toThrow(/fingerprint does not match/);
  });
});

describe("parseFindingInput", () => {
  it("accepts a complete FindingInput and ignores fingerprint", () => {
    const input = sample({
      authoritativeConcept: "Helper",
      testSafetyEvidence: "covered by unit tests",
    });
    expect(parseFindingInput({ ...input, fingerprint: "ignore-me" })).toEqual(input);
  });

  it("rejects missing planner fields", () => {
    const required = [
      "severity",
      "confidence",
      "detectionMode",
      "status",
      "evidence",
      "cleanupBenefit",
      "changeRisk",
      "prerequisiteFindingIds",
    ] as const;
    for (const field of required) {
      const { [field]: _omit, ...incomplete } = sample();
      expect(() => parseFindingInput(incomplete)).toThrow(/Invalid finding/);
    }
  });

  it("rejects enum and nested shape errors", () => {
    expect(() => parseFindingInput(sample({ severity: "urgent" as never }))).toThrow(
      /severity must be/,
    );
    expect(() => parseFindingInput(sample({ evidence: { summary: 1 } as never }))).toThrow(
      /evidence/,
    );
    expect(() =>
      parseFindingInput(sample({ locations: [{ line: 4 }] as never })),
    ).toThrow(/locations\[0\] must include file/);
    expect(() => parseFindingInput(sample({ prerequisiteFindingIds: [1] as never }))).toThrow(
      /prerequisiteFindingIds must be an array of strings/,
    );
  });
});

describe("parseSemanticFindingsFile", () => {
  it("accepts semantic and hybrid findings", () => {
    const semantic = sample({ ruleId: "A01", identity: "fossil:OldLayer", detectionMode: "semantic" });
    const hybrid = sample({ ruleId: "A04", identity: "dup-impl:auth", detectionMode: "hybrid" });
    const file = parseSemanticFindingsFile({
      schemaVersion: 1,
      findings: [semantic, hybrid],
    });
    expect(file.findings).toHaveLength(2);
    expect(file.findings[0]?.fingerprint).toBe(fingerprintFinding(semantic));
    expect(file.findings[1]?.detectionMode).toBe("hybrid");
  });

  it("rejects a surface-complete finding that is missing planner fields", () => {
    expect(() =>
      parseSemanticFindingsFile({
        schemaVersion: 1,
        findings: [
          {
            ruleId: "A01",
            identity: "foo",
            title: "Foo",
            explanation: "Foo",
            locations: [],
            affectedSymbols: [],
          },
        ],
      }),
    ).toThrow(/Invalid finding/);
  });

  it("rejects deterministic and arbitrary detection modes", () => {
    expect(() =>
      parseSemanticFindingsFile({
        schemaVersion: 1,
        findings: [sample({ detectionMode: "deterministic" })],
      }),
    ).toThrow(/semantic-only findings must use detectionMode semantic or hybrid/);
    expect(() =>
      parseSemanticFindingsFile({
        schemaVersion: 1,
        findings: [sample({ detectionMode: "manual" as never })],
      }),
    ).toThrow(/detectionMode must be/);
  });
});
