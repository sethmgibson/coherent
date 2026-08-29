import { describe, expect, it } from "vitest";
import { auditFixture, byRule, findingFor } from "./helpers/audit-fixture.js";

describe("A08 dead-code", () => {
  it("confirms unused internals and unreachable code", async () => {
    const { findings } = await auditFixture();
    const dead = byRule(findings, "A08");

    const internal = findingFor(dead, "neverUsedInternal");
    expect(internal?.status).toBe("confirmed");
    expect(internal?.confidence).toBe("high");
    expect(internal?.evidence.summary).toMatch(/No static references/i);

    expect(findingFor(dead, "unusedConstant")?.status).toBe("confirmed");
    expect(findingFor(dead, "unusedCliLocal")?.status).toBe("confirmed");
    expect(findingFor(dead, "unusedInsidePlugin")?.status).toBe("confirmed");
    expect(dead.some((finding) => finding.title === "Unreachable statement")).toBe(true);
  });

  it("does not confirm public, decorated, CLI, or dynamic-import surfaces", async () => {
    const { findings } = await auditFixture();
    const dead = byRule(findings, "A08");

    expect(findingFor(dead, "usedHelper")).toBeUndefined();
    expect(findingFor(dead, "syncUsers")).toBeUndefined();

    const exported = findingFor(dead, "unusedPublicLookingExport");
    expect(exported?.status).toBe("candidate");

    const publicApi = findingFor(dead, "documentedPublicApi");
    expect(publicApi?.status).not.toBe("confirmed");

    const controller = findingFor(dead, "UsersController");
    expect(controller?.status).not.toBe("confirmed");
    expect(controller?.evidence.details?.join(" ") ?? "").toMatch(/decorator|framework/i);

    const plugin = findingFor(dead, "pluginInit");
    expect(plugin?.status).not.toBe("confirmed");

    const cliExport = findingFor(dead, "unusedCliExport");
    expect(cliExport?.status).not.toBe("confirmed");
  });

  it("does not confirm spec mocks or CJS destructured bindings", async () => {
    const { findings } = await auditFixture();
    const dead = byRule(findings, "A08");

    expect(findingFor(dead, "connect")).toBeUndefined();
    expect(findingFor(dead, "from")).toBeUndefined();
    expect(findingFor(dead, "where")).toBeUndefined();
    expect(findingFor(dead, "jobNames")).toBeUndefined();
    expect(findingFor(dead, "LedgerMock")).toBeUndefined();

    expect(dead.some((finding) => finding.affectedSymbols.includes("{ Pool }"))).toBe(false);
    expect(findingFor(dead, "Pool")).toBeUndefined();
    expect(findingFor(dead, "Client")).toBeUndefined();
  });
});
