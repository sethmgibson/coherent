import { ESLint } from "eslint";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { render as probeRender } from "./eslint-ci-probe.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const eslint = new ESLint({ cwd: repoRoot });
const probePath = join(repoRoot, "tests", "eslint-ci-probe.ts");
const originalProbe = await readFile(probePath, "utf8");

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

async function lintProbe(source: string) {
  await writeFile(probePath, source);
  try {
    // A fresh ESLint reads the current file. lintText against a different
    // on-disk AST skips type-aware rules on GitHub Actions Linux.
    const instance = new ESLint({ cwd: repoRoot });
    return (await instance.lintFiles([probePath])).flatMap((result) => result.messages);
  } finally {
    await writeFile(probePath, originalProbe);
  }
}

afterEach(async () => {
  await writeFile(probePath, originalProbe);
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
    const messages = await lintProbe(unsafeSource);

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
    const results = await eslint.lintFiles([probePath]);
    expect(results.flatMap((result) => result.messages)).toEqual([]);
  });

  it.each([
    "tests/fixtures/scanner-app/src/unused-internal.ts",
    "dist/cli.js",
    "coverage/report.js",
  ])("excludes generated output or intentional fixtures: %s", async (filePath) => {
    expect(await eslint.isPathIgnored(join(repoRoot, filePath))).toBe(true);
  });
});
