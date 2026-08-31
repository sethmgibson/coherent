import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runAudit } from "../src/audit/run.js";

describe("analysis completeness", () => {
  it("fails closed when a discovered TypeScript config cannot be read", async () => {
    const root = await repositoryFixture("coherent-analysis-invalid-config-");
    try {
      await writeFile(join(root, "tsconfig.json"), "{ invalid", "utf8");

      await expect(runAudit(root)).rejects.toThrow(
        /Incomplete analysis: failed to read TypeScript config tsconfig\.json: TS\d+/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails closed when a TypeScript config has unresolved configuration errors", async () => {
    const root = await repositoryFixture("coherent-analysis-broken-extends-");
    try {
      await writeFile(
        join(root, "tsconfig.json"),
        `${JSON.stringify({ extends: "./missing-base.json", include: ["src/**/*.ts"] }, null, 2)}\n`,
        "utf8",
      );

      await expect(runAudit(root)).rejects.toThrow(
        /Incomplete analysis: failed to parse TypeScript config tsconfig\.json: TS\d+/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails closed when a scoped source file cannot be loaded", async () => {
    const root = await repositoryFixture("coherent-analysis-missing-source-");
    try {
      await writeFile(
        join(root, "tsconfig.json"),
        `${JSON.stringify({ compilerOptions: { strict: true }, include: ["src/**/*.ts"] }, null, 2)}\n`,
        "utf8",
      );

      await expect(runAudit(root, { include: ["src/missing.ts"] })).rejects.toThrow(
        /Incomplete analysis: failed to load source file src\/missing\.ts:/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function repositoryFixture(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({ name: "analysis-fixture", type: "module" }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(join(root, "src/index.ts"), "export const value = 1;\n", "utf8");
  return root;
}
