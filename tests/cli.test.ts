import { execFile, spawn } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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
// Multi-command CLI workflows spawn a fresh tsx+audit process per call (~0.5-0.7s
// idle; >1s under a loaded suite). Five sequential audits exceed Vitest's 5s default.
const CLI_WORKFLOW_TIMEOUT_MS = 15_000;

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
  it.each([
    ["audit", "--json"], ["audit", "--compact-json"], ["plan", "--json"],
  ])("keeps %s %s stdout parseable with an explicit output file", async (command, format) => {
    const root = await mkdtemp(join(tmpdir(), "coherent-cli-json-output-"));
    try {
      await writeFile(join(root, "package.json"), '{"name":"clean"}\n');
      const result = await runCli([command, root, format, "--output", "result.json"]);
      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(JSON.parse(await readFile(join(root, "result.json"), "utf8")));
      expect(result.stderr).toContain("Wrote ");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reports the package manifest version", async () => {
    const packageJson = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8")) as {
      version: string;
    };
    const result = await runCli(["--version"]);

    expect(result).toEqual({ stdout: `${packageJson.version}\n`, stderr: "", code: 0 });
  });

  it("reports runtime identity and rejects incompatible skill requirements", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-runtime-cli-"));
    try {
      await writeFile(
        join(root, "pnpm-lock.yaml"),
        "coherent:\n  version: https://codeload.github.com/sethmgibson/coherent/tar.gz/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n",
      );
      const result = await runCli(["version", root, "--json"]);
      expect(result.code).toBe(0);
      const report = JSON.parse(result.stdout) as {
        runtime: {
          coherentVersion: string;
          workflowRevision: number;
          detectorRevision: number;
          packageRoot: string;
          skillPath: string;
          declaredRevision?: string;
          capabilities: string[];
        };
        compatible: boolean;
      };
      expect(report.compatible).toBe(true);
      expect(report.runtime).toMatchObject({
        coherentVersion: "0.2.0",
        workflowRevision: 2,
        packageRoot: repoRoot,
        declaredRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      });
      expect(report.runtime.detectorRevision).toEqual(expect.any(Number));
      expect(report.runtime.capabilities).toContain("doctor-staged");
      expect(report.runtime.capabilities).toContain("canonical-skill-path");
      expect(report.runtime.skillPath).toBe(join(repoRoot, "skills", "coherent", "SKILL.md"));

      const mismatch = await runCli([
        "version", root, "--json", "--expect-detector", "999",
        "--require-capability", "missing-capability",
      ]);
      expect(mismatch.code).toBe(1);
      expect(JSON.parse(mismatch.stdout)).toMatchObject({ compatible: false });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("runs install and update without creating files when no integration is selected", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-cli-no-integration-"));
    try {
      for (const command of ["install", "update"]) {
        const result = await runCli([command, root]);
        expect(result.code).toBe(0);
        if (command === "update") expect(result.stdout).toContain("does not update the Coherent CLI package");
        expect(await readdir(root)).toEqual([]);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

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
      expect(result.stdout).toMatch(/Signals: \d+.*Dismissed:/);
      await expect(readdir(join(root, ".coherent"))).rejects.toMatchObject({ code: "ENOENT" });

      const output = "artifacts/plan.json";
      const saved = await runCli(["plan", root, "--output", output]);
      expect(saved.code).toBe(0);
      const plan: unknown = JSON.parse(await readFile(join(root, output), "utf8"));
      expect(plan).toHaveProperty("nodes", expect.any(Array));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("inspects one audit snapshot, reviewed plan, and next node", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-inspect-"));
    await cp(scannerFixture, root, { recursive: true });
    try {
      const stateBefore = await readdir(join(root, ".coherent"));
      const result = await runCli(["inspect", root, "--json"]);
      expect(result.code).toBe(0);
      const inspection = JSON.parse(result.stdout) as {
        runtime: { workflowRevision: number };
        terminalState: string;
        audit: {
          runtime: { detectorRevision: number };
          summary: { total: number };
          findings: Array<{ fingerprint: string }>;
          candidates?: unknown;
        };
        plan: {
          readyNodeIds: string[];
          reviewSummary?: { detected: number };
        };
        nextNode: { id: string } | null;
      };
      expect(inspection.audit.findings).toHaveLength(inspection.audit.summary.total);
      expect(inspection.runtime.workflowRevision).toBe(2);
      expect(inspection.terminalState).toEqual(expect.any(String));
      expect(inspection.audit.runtime.detectorRevision).toEqual(expect.any(Number));
      expect(inspection.plan).toHaveProperty("terminalState");
      expect(inspection.audit.candidates).toBeUndefined();
      expect(inspection.plan.reviewSummary?.detected).toBe(
        inspection.audit.summary.total,
      );
      if (inspection.nextNode) {
        expect(inspection.plan.readyNodeIds).toContain(inspection.nextNode.id);
      }
      expect(await readdir(join(root, ".coherent"))).toEqual(stateBefore);

      const plain = await runCli(["inspect", root]);
      expect(plain.code).toBe(0);
      expect(plain.stdout).toContain("Coherent inspect");
      expect(plain.stdout).toContain("Coherent cleanup plan");
      expect(plain.stdout).toContain("Coherent fix next");
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

  it("treats an empty reviewed plan as a successful fix-next terminal", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-fix-clean-"));
    try {
      await writeFile(join(root, "package.json"), '{"name":"clean"}\n', "utf8");
      const result = await runCli(["fix", "next", root]);
      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(/reviewed plan is clean/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("requires candidate review and returns exact evidence without another audit", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-fix-review-"));
    try {
      await writeFile(join(root, "package.json"), '{"name":"candidate"}\n');
      await writeFile(join(root, "helper.ts"), "export function orphan(): number { return 1; }\n");
      const before = await runCli(["fix", "next", root]);
      expect(before.code).toBe(1);
      expect(before.stdout).toContain("inspect --json");
      expect(before.stdout).toContain("not clean");
      await expect(readdir(join(root, ".coherent"))).rejects.toMatchObject({ code: "ENOENT" });

      const initial = await runCli(["inspect", root, "--json"]);
      const snapshot = JSON.parse(initial.stdout) as {
        audit: { findings: Array<{ fingerprint: string; status: string }> };
        nextNode: unknown;
        nextFindings: unknown[];
      };
      expect(snapshot.nextNode).toBeNull();
      expect(snapshot.nextFindings).toEqual([]);
      const target = snapshot.audit.findings[0]!;
      expect(target.status).toBe("candidate");
      const reviewBatch = JSON.stringify([{
        fingerprint: target.fingerprint,
        decision: "confirmed",
        reason: "Internal app helper; checked all imports, package exports, and runtime registration.",
      }]);
      await writeFile(join(root, "review-batch.json"), reviewBatch);
      const confirmed = await runCli([
        "review", "apply", root, "--input", "review-batch.json",
      ]);
      expect(confirmed.code).toBe(0);

      const selected = await runCli(["fix", "next", root, "--json"]);
      expect(selected.code).toBe(0);
      const brief = JSON.parse(selected.stdout) as {
        node: { findingFingerprints: string[]; status: string };
        findings: Array<{ fingerprint: string; status: string; locations: unknown[]; evidence: { summary: string } }>;
      };
      expect(brief.node.status).toBe("confirmed");
      expect(brief.findings.map((finding) => finding.fingerprint)).toEqual(brief.node.findingFingerprints);
      expect(brief.findings[0]).toMatchObject({
        fingerprint: target.fingerprint,
        status: "confirmed",
        locations: [{ file: "helper.ts", line: 1, column: 1, symbol: "orphan" }],
        evidence: { summary: "No static references to function 'orphan' were found." },
      });

      const inspected = await runCli(["inspect", root, "--json"]);
      const reviewed = JSON.parse(inspected.stdout) as typeof snapshot;
      expect(reviewed.audit.findings[0]?.status).toBe("candidate");
      expect(reviewed.nextFindings).toEqual(brief.findings);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, CLI_WORKFLOW_TIMEOUT_MS);

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
            ...(target.ruleId === "A07"
              ? { removalMilestone: "Remove after the test fixture migration." }
              : {}),
            ...(index === 1
              ? {
                  missingEvidence: "Need the owning module named.",
                  reconsiderWhen: "After the next inspect.",
                }
              : {}),
          })),
        ),
      );
      expect(applied.code).toBe(0);
      expect(applied.stdout).toMatch(/Review apply|2 decision/);
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
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, CLI_WORKFLOW_TIMEOUT_MS);

  it("exposes install, update, and check --changed", async () => {
    const check = await runCli(["check", "--help"]);
    expect(check.code).toBe(0);
    expect(check.stdout).toContain("--changed");
    const inspect = await runCli(["inspect", "--help"]);
    expect(inspect.stdout).toContain("--performance");
    const plan = await runCli(["plan", "--help"]);
    expect(plan.stdout).toContain("--performance");
    const fix = await runCli(["fix", "next", "--help"]);
    expect(fix.stdout).toContain("--performance");
    const doctorHelp = await runCli(["doctor", "--help"]);
    expect(doctorHelp.stdout).toContain("--deep");
    expect(doctorHelp.stdout).toContain("--staged");
    expect(doctorHelp.stdout).toContain("--ref");
    const apply = await runCli(["review", "apply", "--help"]);
    expect(apply.stdout).toContain("--input");
    const queue = await runCli(["review", "queue", "--help"]);
    expect(queue.stdout).toContain("--group-by");
    expect(queue.stdout).toContain("advisory");
    const install = await runCli(["install", "--help"]);
    expect(install.code).toBe(0);
    expect(install.stdout).toMatch(/prevention|adapter|hooks/i);
    expect(install.stdout).toContain("--providers");
    expect(install.stdout).toContain("--scope");
    expect(install.stdout).toContain("--yes");
    expect(install.stdout).toContain("github:sethmgibson/coherent");
    expect(install.stdout).not.toContain("npx coherent install");
    const update = await runCli(["update", "--help"]);
    expect(update.code).toBe(0);
    expect(update.stdout).toMatch(/Refresh|adapter|edits/i);
    const prune = await runCli(["review", "prune", "--help"]);
    expect(prune.code).toBe(0);
    expect(prune.stdout).toContain("--write");
    const dismiss = await runCli(["review", "dismiss", "--help"]);
    expect(dismiss.code).toBe(0);
    expect(dismiss.stdout).toContain("--expires-at");
    expect(dismiss.stdout).toContain("--removal-milestone");
    expect(dismiss.stdout).toContain("--not-compatibility");
    const defer = await runCli(["review", "defer", "--help"]);
    expect(defer.code).toBe(0);
    expect(defer.stdout).toContain("--expires-at");
    expect(defer.stdout).toContain("--removal-milestone");
  }, CLI_WORKFLOW_TIMEOUT_MS);

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
      const findings: unknown = JSON.parse(
        await readFile(join(root, output), "utf8"),
      );
      expect(findings).toHaveProperty("findings", expect.any(Array));
      expect(findings).toHaveProperty("runtime.workflowRevision", 2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("prints compact audit JSON without duplicate finding collections", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-audit-compact-"));
    await cp(scannerFixture, root, { recursive: true });
    try {
      const result = await runCli(["audit", root, "--compact-json"]);
      expect(result.code).toBe(0);
      const compact = JSON.parse(result.stdout) as {
        runtime: { workflowRevision: number };
        summary: {
          total: number;
          confirmed: number;
          candidates: number;
          byRule: Array<{ ruleId: string; total: number }>;
        };
        findings: Array<{
          fingerprint: string;
          identity: string;
          evidence: { summary: string };
          locations: Array<{ file: string }>;
        }>;
        candidates?: unknown;
        confirmed?: unknown;
        groups?: unknown;
        metrics?: unknown;
      };
      expect(compact.findings).toHaveLength(compact.summary.total);
      expect(compact.runtime.workflowRevision).toBe(2);
      expect(compact.summary.confirmed + compact.summary.candidates).toBe(
        compact.summary.total,
      );
      expect(compact.summary.byRule.reduce((sum, rule) => sum + rule.total, 0)).toBe(
        compact.summary.total,
      );
      expect(new Set(compact.findings.map((finding) => finding.fingerprint)).size).toBe(
        compact.findings.length,
      );
      expect(compact.findings[0]?.fingerprint).toEqual(expect.any(String));
      expect(compact.findings[0]?.identity).toEqual(expect.any(String));
      expect(compact.findings[0]?.evidence.summary).toEqual(expect.any(String));
      expect(compact.findings[0]?.locations).toEqual(expect.any(Array));
      expect(compact.candidates).toBeUndefined();
      expect(compact.confirmed).toBeUndefined();
      expect(compact.groups).toBeUndefined();
      expect(compact.metrics).toBeUndefined();
      expect(compact.findings[0]).not.toHaveProperty("title");
      expect(compact.findings[0]).not.toHaveProperty("affectedSymbols");
      expect(compact.findings[0]).not.toHaveProperty("changeRisk");

      const output = "artifacts/compact-findings.json";
      const saved = await runCli(["audit", root, "--compact-json", "--output", output]);
      expect(saved.code).toBe(0);
      const written = JSON.parse(await readFile(join(root, output), "utf8")) as typeof compact;
      expect(written.summary.total).toBe(compact.summary.total);
      expect(written.candidates).toBeUndefined();
      const serialized = await readFile(join(root, output), "utf8");
      expect(serialized.split("\n")).toHaveLength(2);

      const conflicting = await runCli(["audit", root, "--json", "--compact-json"]);
      expect(conflicting.code).toBe(1);
      expect(conflicting.stderr).toContain("either --json or --compact-json");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
