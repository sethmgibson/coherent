import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(repoRoot, "src", "cli.ts");
const tsx = join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
const expressFixture = join(repoRoot, "tests", "fixtures", "express-app");

async function runCli(
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const result = await execFileAsync(process.execPath, [tsx, cli, ...args], {
      cwd: repoRoot,
    });
    return { stdout: result.stdout, stderr: result.stderr, code: 0 };
  } catch (error) {
    const failure = error as {
      stdout?: string;
      stderr?: string;
      code?: number;
    };
    return {
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
      code: failure.code ?? 1,
    };
  }
}

describe("CLI", () => {
  it("inits a repository through the public command", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-cli-"));
    await cp(expressFixture, root, { recursive: true });
    try {
      const result = await runCli(["init", root]);
      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(/Wrote .*ARCHITECTURE\.md/);
      expect(result.stdout).toContain("Express");

      const architecture = await readFile(
        join(root, ".backend", "ARCHITECTURE.md"),
        "utf8",
      );
      expect(architecture).toContain("express-app");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("builds a cleanup plan for a fixture", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-plan-"));
    await cp(expressFixture, root, { recursive: true });
    try {
      const result = await runCli(["plan", root]);
      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(/Coherent cleanup plan|READY|No cleanup nodes/);
      const plan = JSON.parse(await readFile(join(root, ".backend", "plan.json"), "utf8"));
      expect(Array.isArray(plan.nodes)).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("selects one fix-next node from a fixture", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-fix-"));
    await cp(expressFixture, root, { recursive: true });
    try {
      const result = await runCli(["fix", "next", root]);
      expect([0, 1]).toContain(result.code);
      expect(result.stdout).toMatch(/Coherent fix next|No unlocked cleanup node/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("runs audit on a fixture and writes findings.json", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-audit-"));
    await cp(expressFixture, root, { recursive: true });
    try {
      const result = await runCli(["audit", root]);
      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(/Coherent audit|PHASE /);
      const findings = JSON.parse(
        await readFile(join(root, ".backend", "findings.json"), "utf8"),
      );
      expect(Array.isArray(findings.findings)).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
