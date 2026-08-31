import { ESLint } from "eslint";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const eslint = new ESLint({ cwd: repoRoot });

describe("type-aware ESLint gate", () => {
  it.each([
    "src/cli.ts",
    "tests/eslint.test.ts",
    "scripts/generate-skill-docs.ts",
    "vitest.config.ts",
  ])("rejects unsafe code in %s", async (filePath) => {
    const results = await eslint.lintText(`
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
    `, { filePath });
    const messages = results.flatMap((result) => result.messages);

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
    const results = await eslint.lintText(`
      export async function render(state: 'ready' | 'blocked'): Promise<string> {
        const value: unknown = JSON.parse('"Ready"');
        if (typeof value !== 'string') throw new Error('Expected a string');
        await Promise.resolve();
        switch (state) {
          case 'ready': return value;
          case 'blocked': return 'Blocked';
        }
      }
    `, { filePath: "src/cli.ts" });

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
