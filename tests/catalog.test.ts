import { describe, expect, it } from "vitest";
import { PHASES, PHASES_BY_ID } from "../src/catalog/phases.js";
import { CATEGORIES, CATEGORIES_BY_ID, RULES, RULES_BY_ID } from "../src/catalog/rules.js";
import {
  CATEGORY_IDS,
  DETECTION_MODES,
  PHASE_IDS,
  RULE_IDS,
  WORK_KINDS,
  type RuleId,
} from "../src/catalog/types.js";

describe("rule catalog", () => {
  it("contains each declared rule id exactly once", () => {
    expect(RULES.map((rule) => rule.id).sort()).toEqual([...RULE_IDS].sort());
    expect(new Set(RULES.map((rule) => rule.id)).size).toBe(RULE_IDS.length);
  });

  it("has unique slugs", () => {
    const slugs = RULES.map((rule) => rule.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("uses valid metadata on every rule", () => {
    for (const rule of RULES) {
      expect(RULE_IDS).toContain(rule.id);
      expect(CATEGORY_IDS).toContain(rule.category);
      expect(rule.id.startsWith(rule.category)).toBe(true);
      expect(DETECTION_MODES).toContain(rule.detectionMode);
      expect(WORK_KINDS).toContain(rule.workKind);
      expect(PHASE_IDS).toContain(rule.defaultCleanupPhase);
      expect(rule.defaultCleanupPhase).not.toBe(0);
      expect(rule.slug).toMatch(/^[a-z0-9-]+$/);
      expect(rule.title.length).toBeGreaterThan(0);
      expect(rule.description.length).toBeGreaterThan(0);
      expect(rule.whyItMatters.length).toBeGreaterThan(0);
    }
  });

  it("only references real rules as prerequisites and re-scans", () => {
    const ids = new Set<string>(RULE_IDS);
    for (const rule of RULES) {
      for (const prerequisite of rule.prerequisites) {
        expect(ids.has(prerequisite), `${rule.id} prerequisite ${prerequisite}`).toBe(
          true,
        );
        expect(prerequisite).not.toBe(rule.id);
      }
      for (const rescan of rule.rescanAfter) {
        expect(ids.has(rescan), `${rule.id} rescan ${rescan}`).toBe(true);
      }
    }
  });

  it("looks up every rule by id", () => {
    for (const id of RULE_IDS) {
      expect(RULES_BY_ID[id].id).toBe(id);
    }
  });

  it("does not treat semantic rules as deterministic", () => {
    const semantic = RULES.filter((rule) => rule.detectionMode === "semantic");
    expect(semantic.map((rule) => rule.id)).toEqual(
      expect.arrayContaining(["A01", "A02", "B01", "B02", "C01", "C02", "C05"]),
    );
    expect(RULES_BY_ID.A08.detectionMode).toBe("deterministic");
    expect(RULES_BY_ID.B03.detectionMode).toBe("hybrid");
  });
});

describe("cleanup phases", () => {
  it("defines phases 0 through 8 in order", () => {
    expect(PHASES.map((phase) => phase.id)).toEqual([...PHASE_IDS]);
  });

  it("keeps phase 0 free of rules", () => {
    expect(PHASES_BY_ID[0].sequence).toEqual([]);
  });

  it("only sequences real rules and keeps default phases consistent", () => {
    const seen = new Set<RuleId>();
    for (const phase of PHASES) {
      for (const ruleId of phase.sequence) {
        expect(RULES_BY_ID[ruleId]).toBeDefined();
        const rule = RULES_BY_ID[ruleId];
        if (ruleId !== "A08" || phase.id === 1) {
          if (!seen.has(ruleId)) {
            expect(rule.defaultCleanupPhase).toBe(phase.id);
            seen.add(ruleId);
          }
        }
      }
    }
    expect(seen.size).toBe(RULE_IDS.length);
  });

  it("re-scans dead code after compatibility, canonicalization, and architecture collapse", () => {
    expect(PHASES_BY_ID[1].sequence).toEqual(["A08", "A07", "A08"]);
    expect(PHASES_BY_ID[3].sequence.at(-1)).toBe("A08");
    expect(PHASES_BY_ID[4].sequence.at(-1)).toBe("A08");
    expect(RULES_BY_ID.A07.rescanAfter).toContain("A08");
    expect(RULES_BY_ID.A04.rescanAfter).toEqual(
      expect.arrayContaining(["A08", "B04", "B05", "D04", "D05"]),
    );
    expect(RULES_BY_ID.A06.rescanAfter).toEqual(expect.arrayContaining(["A08", "B05", "E04"]));
    expect(RULES_BY_ID.B01.rescanAfter).toEqual(expect.arrayContaining(["A08", "D01"]));
  });

  it("puts dependency cleanup after reliability and performance last", () => {
    expect(PHASES_BY_ID[6].sequence).toEqual(["D02", "D03", "D04", "D05"]);
    expect(PHASES_BY_ID[7].sequence).toEqual(["D01"]);
    expect(PHASES_BY_ID[8].sequence).toEqual([
      "E01",
      "E02",
      "E03",
      "E04",
      "E05",
      "E06",
    ]);
  });

  it("covers every category", () => {
    expect(CATEGORIES.map((category) => category.id)).toEqual([...CATEGORY_IDS]);
    for (const category of CATEGORIES) {
      expect(CATEGORIES_BY_ID[category.id].id).toBe(category.id);
    }
  });
});
