import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const knip = join(repoRoot, "node_modules", "knip", "bin", "knip.js");

function checkDependencies(root: string, production = false) {
  return spawnSync(process.execPath, [
    knip, "--dependencies", "--reporter", "json",
    ...(production ? ["--production", "--strict"] : []),
  ], { cwd: root, encoding: "utf8", timeout: 15_000 });
}

async function dependencyFixture() {
  const root = await mkdtemp(join(tmpdir(), "coherent-dependencies-"));
  const manifest = {
    name: "coherent-dependency-fixture",
    type: "module",
    bin: { coherent: "./dist/cli.js" },
    exports: { "./finding": "./dist/domain/finding.js" },
    scripts: { "check:dependencies": "knip --dependencies" },
    dependencies: { commander: "*", "ts-morph": "*" } as Record<string, string>,
    devDependencies: { knip: "*", eslint: "*", vitest: "*" } as Record<string, string>,
  };
  try {
    await mkdir(join(root, "src/domain"), { recursive: true });
    await mkdir(join(root, "scripts"));
    await mkdir(join(root, "tests/fixtures"), { recursive: true });
    await cp(join(repoRoot, "knip.json"), join(root, "knip.json"));
    await writeFile(join(root, "tsconfig.json"), JSON.stringify({
      compilerOptions: { rootDir: "src", outDir: "dist" },
      include: ["src/**/*.ts"],
    }));
    await symlink(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
    await writeFile(join(root, "package.json"), JSON.stringify(manifest));
    await writeFile(join(root, "src/cli.ts"), 'import { Command } from "commander"; new Command().parse();\n');
    await writeFile(join(root, "src/domain/finding.ts"), 'export { Project } from "ts-morph";\n');
    await writeFile(join(root, "scripts/maintenance.ts"), 'import { ESLint } from "eslint"; console.log(ESLint);\n');
    await writeFile(join(root, "tests/example.test.ts"), 'import { it } from "vitest"; it("example", () => {});\n');
    await writeFile(join(root, "tests/fixtures/broken.test.ts"), 'import "fixture-only-missing-dependency";\n');
    return { root, manifest };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

describe("dependency hygiene gate", () => {
  it("recognizes CLI, public exports, scripts and tests without scanning intentional fixtures", async () => {
    const { root } = await dependencyFixture();
    try {
      for (const production of [false, true]) {
        const result = checkDependencies(root, production);
        expect(result.error).toBeUndefined();
        expect(result.status, result.stdout + result.stderr).toBe(0);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects unused declarations and unlisted imports", async () => {
    const { root, manifest } = await dependencyFixture();
    try {
      manifest.dependencies["unused-package"] = "*";
      delete manifest.dependencies.commander;
      await writeFile(join(root, "package.json"), JSON.stringify(manifest));
      const result = checkDependencies(root);
      expect(result.error).toBeUndefined();
      expect(result.status, result.stdout + result.stderr).toBe(1);
      expect(result.stdout).toContain("unused-package");
      expect(result.stdout).toContain("commander");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a public runtime dependency declared only as a development dependency", async () => {
    const { root, manifest } = await dependencyFixture();
    try {
      delete manifest.dependencies["ts-morph"];
      manifest.devDependencies["ts-morph"] = "*";
      await writeFile(join(root, "package.json"), JSON.stringify(manifest));
      const development = checkDependencies(root);
      expect(development.status, development.stdout + development.stderr).toBe(0);
      const production = checkDependencies(root, true);
      expect(production.error).toBeUndefined();
      expect(production.status, production.stdout + production.stderr).toBe(1);
      expect(production.stdout).toContain("ts-morph");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
