import { ESLint } from "eslint";
import { spawnSync } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { render as probeRender } from "./eslint-ci-probe.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const eslintJs = join(repoRoot, "node_modules", "eslint", "bin", "eslint.js");
const eslint = new ESLint({ cwd: repoRoot });
const probePath = join(repoRoot, "tests", "eslint-ci-probe.ts");
const unsafePath = join(repoRoot, "tests", "eslint-ci-probe-unsafe.ts");

const unsafeSource = `
  const unsafe = JSON.parse('{}');
  unsafe.run();
  export function readUnsafe() { return JSON.parse('{}'); }
  Promise.resolve();
  void Promise.resolve();
  [1].forEach(async () => { await Promise.resolve(); });
  export function render(state: 'ready' | 'blocked'): string {
    switch (state) {
      case 'ready': return 'Ready';
      default: return 'Other';
    }
  }
`;

function lintFile(filePath: string) {
  const result = spawnSync(process.execPath, [
    eslintJs, filePath, "--format", "json", "--max-warnings", "0",
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 30_000,
    // Vitest's worker NODE_OPTIONS/loader breaks typed lint lib resolution.
    env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" },
  });
  if (result.error) throw result.error;
  const parsed = JSON.parse(result.stdout) as Array<{
    messages: Array<{ ruleId: string | null; severity: number }>;
  }>;
  return parsed.flatMap((file) => file.messages);
}

afterEach(async () => {
  await rm(unsafePath, { force: true });
});

describe("type-aware ESLint gate", () => {
  it.each([
    "src/cli.ts",
    "tests/eslint.test.ts",
    "scripts/generate-skill-docs.ts",
    "vitest.config.ts",
  ])("includes %s in the type-checked lint set", async (filePath) => {
    expect(await eslint.isPathIgnored(join(repoRoot, filePath))).toBe(false);
  });

  it("rejects unsafe code in a project-included TypeScript file", async () => {
    await writeFile(unsafePath, unsafeSource);
    const messages = lintFile(unsafePath);

    expect(messages.map((message) => message.ruleId)).toEqual(expect.arrayContaining([
      "@typescript-eslint/no-unsafe-assignment",
      "@typescript-eslint/no-unsafe-call",
      "@typescript-eslint/no-unsafe-member-access",
      "@typescript-eslint/no-unsafe-return",
      "@typescript-eslint/no-floating-promises",
      "@typescript-eslint/no-misused-promises",
      "@typescript-eslint/switch-exhaustiveness-check",
    ]));
    expect(messages.filter((message) =>
      message.ruleId === "@typescript-eslint/no-floating-promises",
    )).toHaveLength(2);
    expect(messages.every((message) => message.severity === 2)).toBe(true);
  });

  it("accepts narrowed unknown values, handled promises, and exhaustive switches", async () => {
    expect(await probeRender("ready")).toBe("Ready");
    expect(lintFile(probePath)).toEqual([]);
  });

  it.each([
    "tests/fixtures/scanner-app/src/unused-internal.ts",
    "dist/cli.js",
    "coverage/report.js",
  ])("excludes generated output or intentional fixtures: %s", async (filePath) => {
    expect(await eslint.isPathIgnored(join(repoRoot, filePath))).toBe(true);
  });
});
