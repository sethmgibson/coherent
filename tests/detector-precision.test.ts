import { describe, expect, it } from "vitest";
import { auditFixture, byRule, findingFor } from "./helpers/audit-fixture.js";

describe("detector precision regressions", () => {
  it("scopes B03 identities to the declaration file and matches implementations by symbol", async () => {
    const { findings } = await auditFixture();
    const abs = byRule(findings, "B03");
    const dashboards = abs.filter((finding) => finding.affectedSymbols.includes("DashboardReadModel"));
    expect(dashboards).toHaveLength(1);
    expect(dashboards[0]?.identity).toBe("single-impl:src/dashboard-a.ts:DashboardReadModel");
    expect(dashboards.every((finding) => finding.identity.includes("src/"))).toBe(true);
    const gateway = findingFor(abs, "ChargeGateway");
    expect(gateway?.identity).toBe("single-impl:src/gateway.ts:ChargeGateway");
  });

  it("keeps Refund and refund as distinct A03 identities and skips typed switches", async () => {
    const { findings } = await auditFixture();
    const strings = byRule(findings, "A03");
    const refund = strings.find((finding) => finding.identity === "string-protocol:kind:Refund");
    const refundLower = strings.find((finding) => finding.identity === "string-protocol:kind:refund");
    expect(refund).toBeDefined();
    expect(refundLower).toBeDefined();
    expect(refund?.fingerprint).not.toBe(refundLower?.fingerprint);
    expect(strings.every((finding) => !finding.affectedSymbols.includes("open"))).toBe(true);
    expect(strings.every((finding) => !finding.affectedSymbols.includes("closed"))).toBe(true);
  });

  it("distinguishes A06 name overlap from type compatibility", async () => {
    const { findings } = await auditFixture();
    const dups = byRule(findings, "A06");
    const amounts = dups.find((finding) =>
      finding.affectedSymbols.includes("AmountView") &&
      finding.affectedSymbols.includes("AmountRow"),
    );
    expect(amounts?.explanation).toMatch(/overlapping property names|property names/i);
    expect(amounts?.explanation).not.toMatch(/100% structurally compatible/i);
    expect(amounts?.evidence.details?.join(" ")).toMatch(/amount:.*string vs number|number vs string/i);
  });

  it("does not treat comparisons as C04 mutations or claim unused bags are passed broadly", async () => {
    const { findings } = await auditFixture();
    const ctxs = byRule(findings, "C04");
    const bag = findingFor(ctxs, "RequestContext");
    const localeLine = bag?.evidence.details?.find((line) => line.includes("localeIsOk"));
    expect(localeLine).toMatch(/localeIsOk uses /);
    expect(localeLine).not.toMatch(/mutate/i);
    const unused = findingFor(ctxs, "UnusedOptions");
    expect(unused?.explanation).not.toMatch(/passed broadly/i);
    expect(unused?.explanation).toMatch(/No typed consumers were observed/i);
  });

  it("does not confirm a query-builder chain as a B04 forwarding wrapper", async () => {
    const { findings } = await auditFixture();
    const hops = byRule(findings, "B04");
    expect(findingFor(hops, "pageCharges")).toBeUndefined();
    expect(findingFor(hops, "persistCharge")?.status).toBe("confirmed");
  });
});
