import { execFile, spawn } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
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
const scannerFixture = join(repoRoot, "tests", "fixtures", "scanner-app");

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

async function runCliWithInput(
  args: string[],
  input: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [tsx, cli, ...args], { cwd: repoRoot });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolveResult({ stdout, stderr, code: code ?? 1 }));
    child.stdin.end(input);
  });
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
        join(root, ".coherent", "ARCHITECTURE.md"),
        "utf8",
      );
      expect(architecture).toContain("express-app");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("builds a cleanup plan without writing project state", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-plan-"));
    await cp(expressFixture, root, { recursive: true });
    try {
      const result = await runCli(["plan", root]);
      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(/Coherent cleanup plan|READY|No cleanup nodes/);
      await expect(readdir(join(root, ".coherent"))).rejects.toMatchObject({ code: "ENOENT" });

      const output = "artifacts/plan.json";
      const saved = await runCli(["plan", root, "--output", output]);
      expect(saved.code).toBe(0);
      const plan = JSON.parse(await readFile(join(root, output), "utf8"));
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
      await expect(readdir(join(root, ".coherent"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reviews, refreshes, and doctors a fixture", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-review-cli-"));
    await cp(scannerFixture, root, { recursive: true });
    try {
      const init = await runCli(["init", root]);
      expect(init.code).toBe(0);
      const audit = await runCli(["audit", root, "--json"]);
      expect(audit.code).toBe(0);
      const file = JSON.parse(audit.stdout) as {
        findings: { fingerprint: string; ruleId: string }[];
      };
      const targets = file.findings.slice(0, 2);
      expect(targets).toHaveLength(2);
      const applied = await runCliWithInput(
        ["review", "apply", root],
        JSON.stringify(
          targets.map((target, index) => ({
            fingerprint: target.fingerprint,
            decision: index === 0 ? "dismissed" : "deferred",
            reason: `cli batch decision ${index + 1}`,
          })),
        ),
      );
      expect(applied.code).toBe(0);
      expect(applied.stdout).toContain("Applied 2 review decision(s)");
      const decisions = JSON.parse(
        await readFile(join(root, ".coherent", "decisions.json"), "utf8"),
      ) as { reviews: unknown[]; findings: unknown[] };
      expect(decisions.reviews).toHaveLength(2);
      expect(decisions.findings).toEqual([]);
      const refresh = await runCli(["refresh", root]);
      expect(refresh.code).toBe(0);
      expect(refresh.stdout).toMatch(/Updated discovered sections/);
      const doctor = await runCli(["doctor", root]);
      expect(doctor.stdout).toMatch(/Coherent doctor/);
      const doctorHelp = await runCli(["doctor", "--help"]);
      expect(doctorHelp.stdout).toContain("--deep");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("exposes install, update, and check --changed", async () => {
    const check = await runCli(["check", "--help"]);
    expect(check.code).toBe(0);
    expect(check.stdout).toContain("--changed");
    const install = await runCli(["install", "--help"]);
    expect(install.code).toBe(0);
    expect(install.stdout).toMatch(/prevention|adapter|hooks/i);
    const update = await runCli(["update", "--help"]);
    expect(update.code).toBe(0);
    expect(update.stdout).toMatch(/Refresh|adapter|edits/i);
  });

  it("runs audit without writing project state and supports explicit output", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-audit-"));
    await cp(expressFixture, root, { recursive: true });
    try {
      const result = await runCli(["audit", root]);
      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(/Coherent audit|PHASE /);
      await expect(readdir(join(root, ".coherent"))).rejects.toMatchObject({ code: "ENOENT" });

      const output = "artifacts/findings.json";
      const saved = await runCli(["audit", root, "--output", output]);
      expect(saved.code).toBe(0);
      const findings = JSON.parse(
        await readFile(join(root, output), "utf8"),
      );
      expect(Array.isArray(findings.findings)).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
