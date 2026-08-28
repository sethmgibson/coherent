import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { collectInventory } from "../src/inventory.js";

const testsDir = dirname(fileURLToPath(import.meta.url));
const fixtures = join(testsDir, "fixtures");
const repoRoot = join(testsDir, "..");

describe("repository inventory", () => {
  it("inventories a single Express app", async () => {
    const inventory = await collectInventory(join(fixtures, "express-app"));

    expect(inventory.packageManager).toBe("npm");
    expect(inventory.languages).toContain("TypeScript");
    expect(inventory.frameworks).toEqual(["Express"]);
    expect(inventory.packageJsonFiles).toEqual(["package.json"]);
    expect(inventory.tsconfigFiles).toEqual(["tsconfig.json"]);
    expect(inventory.sourceDirectories).toContain("src");
    expect(inventory.testDirectories).toContain("test");
    expect(inventory.packages[0]?.bins).toEqual([
      { name: "express-app", path: "src/cli.ts" },
    ]);
    expect(inventory.entrypoints).toEqual(
      expect.arrayContaining(["src/index.ts", "src/cli.ts"]),
    );
    expect(inventory.topLevelModules).toEqual(
      expect.arrayContaining(["src/routes", "src/services"]),
    );
    expect(inventory.topLevelModules.every((name) => !name.includes("."))).toBe(
      true,
    );
    expect(inventory.dependencies.express).toBeDefined();
    expect(inventory.devDependencies.vitest).toBeDefined();
    expect(inventory.fileCount).toBeGreaterThan(5);
    expect(inventory.lineCount).toBeGreaterThan(10);
    expect(inventory.workspace).toBeNull();
  });

  it("inventories a pnpm NestJS workspace", async () => {
    const inventory = await collectInventory(join(fixtures, "pnpm-workspace"));

    expect(inventory.packageManager).toBe("pnpm");
    expect(inventory.workspace).toEqual({
      kind: "pnpm",
      patterns: ["packages/*"],
      packages: expect.arrayContaining([
        "packages/api/package.json",
        "packages/shared/package.json",
      ]),
    });
    expect(inventory.frameworks).toEqual(["NestJS"]);
    expect(inventory.persistenceLibraries).toContain("@prisma/client");
    expect(inventory.packages.map((pkg) => pkg.name).sort()).toEqual([
      "@billing/api",
      "@billing/shared",
      "billing-monorepo",
    ]);
    expect(inventory.entrypoints).toEqual(
      expect.arrayContaining([
        "packages/api/src/main.ts",
        "packages/api/src/app.module.ts",
        "packages/shared/src/index.ts",
      ]),
    );
    expect(inventory.sourceDirectories).toEqual(
      expect.arrayContaining(["packages/api/src", "packages/shared/src"]),
    );
  });

  it("inventories a Next.js app without claiming extra frameworks", async () => {
    const inventory = await collectInventory(join(fixtures, "next-app"));

    expect(inventory.packageManager).toBe("unknown");
    expect(inventory.frameworks).toEqual(["Next.js"]);
    expect(inventory.languages).toContain("TypeScript");
    expect(inventory.sourceDirectories).toContain("src");
    expect(inventory.topLevelModules).toContain("src/app");
    expect(inventory.persistenceLibraries).toEqual([]);
  });

  it("honors extra ignore names from config", async () => {
    const inventory = await collectInventory(join(fixtures, "express-app"), {
      ignore: ["services"],
    });
    expect(inventory.topLevelModules).not.toContain("src/services");
    expect(inventory.topLevelModules).toContain("src/routes");
  });

  it("does not treat this repository's test fixtures as applications", async () => {
    const inventory = await collectInventory(repoRoot, await loadConfig(repoRoot));
    expect(inventory.packages.map((pkg) => pkg.name)).toEqual(["coherent"]);
    expect(inventory.frameworks).toEqual([]);
    expect(inventory.packageJsonFiles).toEqual(["package.json"]);
  });
});
