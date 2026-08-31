import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { auditFixture, byRule, findingFor } from "./helpers/audit-fixture.js";
import { applyReviews } from "../src/review/apply.js";
import { buildPlan } from "../src/plan/build.js";

describe("test-only usage", () => {
  it("distinguishes test consumers from production callers and preserves public API uncertainty", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-test-only-"));
    try {
      await mkdir(join(root, "src"));
      await writeFile(join(root, "package.json"), JSON.stringify({ name: "public-api", exports: "./src/library.ts" }));
      await writeFile(join(root, "src/library.ts"), `
        export function loadToday(): number { return 1; }
        export function live(): number { return 2; }
        export const testOnlyArrow = () => 3;
        export function recursive(n: number): number { return n ? recursive(n-1) : 0; }
        export class Utility { onlyTested(): number { return 3; } }
      `);
      await writeFile(join(root, "src/library.spec.ts"), `
        import { loadToday, live, testOnlyArrow, recursive, Utility } from './library';
        loadToday(); live(); testOnlyArrow(); recursive(1); new Utility().onlyTested();
      `);
      await writeFile(join(root, "src/app.ts"), "import { live } from './library'; live();");
      const { findings } = await auditFixture(root);
      const dead = byRule(findings, "A08");
      for (const name of ["loadToday", "testOnlyArrow", "recursive", "onlyTested"]) {
        const finding = findingFor(dead, name);
        expect(finding?.identity).toMatch(/^test-only:/);
        expect(finding?.status).toBe("candidate");
        expect(finding?.evidence.details?.join(" ")).toContain("src/library.spec.ts:");
        expect(finding?.changeRisk).toContain("package exports");
      }
      expect(findingFor(dead, "live")).toBeUndefined();
      const merged = applyReviews(dead, [], []);
      expect(buildPlan(root, merged.findings, merged).readyNodeIds).toEqual([]);

      await writeFile(join(root, "src/app.ts"), "import { live, loadToday } from './library'; live(); loadToday();");
      const rerun = await auditFixture(root);
      expect(findingFor(byRule(rerun.findings, "A08"), "loadToday")).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
