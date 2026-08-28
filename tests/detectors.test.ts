import { describe, expect, it } from "vitest";
import { auditFixture, byRule, findingFor, hasSymbol } from "./helpers/audit-fixture.js";

describe("hybrid detectors on scanner-app", () => {
  it("A07 reports compatibility candidates without declaring them obsolete", async () => {
    const { findings } = await auditFixture();
    const compat = byRule(findings, "A07");
    expect(compat.length).toBeGreaterThan(0);
    expect(compat.every((finding) => finding.status === "candidate")).toBe(true);
    expect(compat.some((finding) => /not prove|obsolete/i.test(finding.explanation))).toBe(true);
    expect(hasSymbol(compat, "legacyLoadPayment") || compat.some((f) => /legacy/i.test(f.identity))).toBe(
      true,
    );
  });

  it("A03 groups repeated discriminants and case variants, not prose", async () => {
    const { findings } = await auditFixture();
    const strings = byRule(findings, "A03");
    expect(strings.some((finding) => finding.affectedSymbols.includes("pending"))).toBe(true);
    expect(strings.some((finding) => finding.affectedSymbols.includes("Pending"))).toBe(true);
    expect(strings.every((finding) => !finding.affectedSymbols.includes("hello from the payment service"))).toBe(
      true,
    );
  });

  it("A06 reports overlap without semantic equivalence", async () => {
    const { findings } = await auditFixture();
    const dups = byRule(findings, "A06");
    const pair = dups.find((finding) =>
      finding.affectedSymbols.includes("PaymentData") &&
      finding.affectedSymbols.includes("CanonicalPayment"),
    );
    expect(pair?.status).toBe("candidate");
    expect(pair?.explanation).toMatch(/not a claim of semantic equivalence/i);
    expect(pair?.evidence.summary).toMatch(/%/);
    expect(findingFor(dups, "UnrelatedConfig")).toBeUndefined();
  });

  it("B03 labels single implementations as hybrid candidates", async () => {
    const { findings } = await auditFixture();
    const abs = byRule(findings, "B03");
    const gateway = findingFor(abs, "ChargeGateway");
    expect(gateway?.detectionMode).toBe("hybrid");
    expect(gateway?.status).toBe("candidate");
    const repo = findingFor(abs, "UserRepository");
    expect(repo?.confidence).toBe("low");
  });

  it("B04 flags pure forwards and skips auth/validation wrappers", async () => {
    const { findings } = await auditFixture();
    const hops = byRule(findings, "B04");
    expect(findingFor(hops, "persistCharge")?.status).toBe("confirmed");
    expect(findingFor(hops, "authorizeAndCharge")).toBeUndefined();
    expect(findingFor(hops, "validateThenWrite")).toBeUndefined();
  });

  it("C03 flags many booleans but not a two-flag toggle", async () => {
    const { findings } = await auditFixture();
    const flags = byRule(findings, "C03");
    expect(findingFor(flags, "createOrder")).toBeDefined();
    expect(findingFor(flags, "toggleFeature")).toBeUndefined();
  });

  it("C04 reports large context objects and tiny-subset consumers", async () => {
    const { findings } = await auditFixture();
    const ctxs = byRule(findings, "C04");
    const bag = findingFor(ctxs, "RequestContext");
    expect(bag?.evidence.details?.join(" ")).toMatch(/tiny subset/i);
    expect(bag?.evidence.details?.join(" ")).toMatch(/mutate/i);
  });

  it("D03 distinguishes swallow, fallback, rethrow, and translation", async () => {
    const { findings } = await auditFixture();
    const errors = byRule(findings, "D03");
    expect(findingFor(errors, "loadUser")?.status).toBe("confirmed");
    expect(findingFor(errors, "loadProfile")?.status).toBe("confirmed");
    expect(findingFor(errors, "loadOrLog")?.status).toBe("candidate");
    expect(findingFor(errors, "loadAndIgnore")?.status).toBe("confirmed");
    expect(findingFor(errors, "loadOrRethrow")).toBeUndefined();
    expect(findingFor(errors, "loadOrTranslate")).toBeUndefined();
  });

  it("D01 reports unused runtime deps and a known overlap family", async () => {
    const { findings } = await auditFixture();
    const deps = byRule(findings, "D01");
    expect(findingFor(deps, "moment")?.status).toBe("confirmed");
    expect(findingFor(deps, "express")).toBeUndefined();
    expect(deps.some((finding) => finding.identity.includes("lodash") && finding.identity.includes("underscore"))).toBe(
      true,
    );
  });

  it("E01/E05/E06 report conservative performance candidates", async () => {
    const { findings } = await auditFixture();
    const db = byRule(findings, "E01");
    expect(findingFor(db, "loadUsersNPlusOne")).toBeDefined();
    expect(findingFor(db, "loadUserTwice")).toBeDefined();

    const seq = byRule(findings, "E05");
    expect(findingFor(seq, "loadDashboard")?.evidence.summary).toMatch(/independent/i);
    expect(findingFor(seq, "loadThenUse")).toBeUndefined();
    expect(findingFor(seq, "loadUsersNPlusOne")?.identity).toMatch(/await-in-loop/);

    const algo = byRule(findings, "E06");
    expect(findingFor(algo, "matchItems")).toBeDefined();
    expect(findingFor(algo, "filterInside")).toBeDefined();
    expect(findingFor(algo, "nestedWalk")).toBeDefined();
    expect(findingFor(algo, "sortInside")).toBeDefined();
    expect(findingFor(algo, "linearScan")).toBeUndefined();
    expect(algo.every((finding) => /probable complexity/i.test(finding.explanation))).toBe(true);
  });
});
