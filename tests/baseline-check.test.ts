import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DETECTOR_REVISION, FINGERPRINT_VERSION } from "../src/config.js";
import { runAudit } from "../src/audit/run.js";
import { runBaseline } from "../src/baseline/run.js";
import { runCheck } from "../src/check/run.js";
import { fingerprintFinding } from "../src/domain/finding.js";
import { scannerFixture } from "./helpers/audit-fixture.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("fingerprints, baseline, and check", () => {
  it("keeps fingerprints stable across rescans", async () => {
    const first = await runAudit(scannerFixture);
    const second = await runAudit(scannerFixture);
    const a = first.findings.map((finding) => finding.fingerprint).sort();
    const b = second.findings.map((finding) => finding.fingerprint).sort();
    expect(a).toEqual(b);
    expect(first.findings.every((finding) => finding.fingerprint === fingerprintFinding(finding))).toBe(
      true,
    );
  });

  it("classifies NEW, EXISTING, and RESOLVED and fails only on new confirmed high deterministic findings", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-check-"));
    await cp(scannerFixture, root, { recursive: true });
    try {
      const baseline = await runBaseline(root);
      expect(baseline.baseline.findings.length).toBeGreaterThan(0);
      expect(baseline.baseline.schemaVersion).toBe(1);
      expect(baseline.baseline.fingerprintVersion).toBe(FINGERPRINT_VERSION);
      expect(baseline.baseline.detectorRevision).toBe(DETECTOR_REVISION);
      expect(baseline.baseline.root).toBeUndefined();
      expect(JSON.stringify(baseline.baseline)).not.toContain(root);

      const clean = await runCheck(root);
      expect(clean.newFindings).toEqual([]);
      expect(clean.existingFindings.length).toBe(baseline.baseline.findings.length);
      expect(clean.resolvedFindings).toEqual([]);
      expect(clean.exitCode).toBe(0);

      await writeFile(
        join(root, "src", "unused-internal.ts"),
        `export function reachableAfterCleanup(): string { return "kept"; }\n`,
        "utf8",
      );
      await writeFile(
        join(root, "src", "brand-new-dead.ts"),
        `function brandNewDead(): number { return 1; }\n`,
        "utf8",
      );

      const drifted = await runCheck(root);
      expect(drifted.resolvedFindings.some((item) => item.symbols.includes("neverUsedInternal"))).toBe(
        true,
      );
      const created = drifted.newFindings.find((item) => item.symbols.includes("brandNewDead"));
      expect(created?.kind).toBe("NEW");
      expect(created?.detectionMode).toBe("deterministic");
      expect(created?.status).toBe("confirmed");
      expect(drifted.exitCode).toBe(1);
      expect(drifted.failing.some((item) => item.symbols.includes("brandNewDead"))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("treats a version-skewed baseline as stale instead of flooding NEW findings", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-stale-"));
    await cp(scannerFixture, root, { recursive: true });
    try {
      await runBaseline(root);
      const path = join(root, ".coherent", "baseline.json");
      const baseline = JSON.parse(await readFile(path, "utf8")) as { detectorRevision: number };
      baseline.detectorRevision = 99;
      await writeFile(path, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
      await expect(runCheck(root)).rejects.toThrow(/Re-run `coherent baseline`/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps unique fingerprints in the committed baseline", async () => {
    const baseline = JSON.parse(
      await readFile(join(repoRoot, ".coherent", "baseline.json"), "utf8"),
    ) as { findings: { fingerprint: string }[] };
    const fingerprints = baseline.findings.map((entry) => entry.fingerprint);
    expect(fingerprints.length).toBeGreaterThan(0);
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
  });
});
