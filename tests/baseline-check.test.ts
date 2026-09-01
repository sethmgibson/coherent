import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DETECTOR_REVISION, FINGERPRINT_VERSION } from "../src/config.js";
import { runAudit } from "../src/audit/run.js";
import { readBaseline, runBaseline } from "../src/baseline/run.js";
import { renderCheck, runCheck } from "../src/check/run.js";
import { fingerprintFinding } from "../src/domain/finding.js";
import { scannerFixture } from "./helpers/audit-fixture.js";
import { runReview } from "../src/review/run.js";

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

  it("reports baseline drift and review disposition as separate states", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-check-reviewed-"));
    await cp(scannerFixture, root, { recursive: true });
    try {
      const baseline = await runBaseline(root);
      const target = baseline.audit.findings.find(
        (finding) => finding.ruleId === "A08" && finding.status === "candidate",
      );
      expect(target).toBeDefined();
      await runReview(
        root,
        "dismissed",
        target!.fingerprint,
        "Intentional public or test support surface verified during review.",
      );
      const raw = JSON.parse(await readFile(baseline.baselinePath, "utf8")) as {
        findings: Array<{ fingerprint: string }>;
      };
      raw.findings = raw.findings.filter(
        (finding) => finding.fingerprint !== target!.fingerprint,
      );
      await writeFile(baseline.baselinePath, `${JSON.stringify(raw, null, 2)}\n`);

      const result = await runCheck(root);
      const reviewed = result.newFindings.find(
        (finding) => finding.fingerprint === target!.fingerprint,
      );
      expect(reviewed).toMatchObject({
        kind: "NEW",
        reviewState: "dismissed",
        reviewDecision: "dismissed",
        reviewMatch: "exact",
      });
      expect(result.reviewSummary.dismissed).toBe(1);
      expect(result.gateStatus).toBe("passed");
      expect(result.driftStatus).toBe("present");
      expect(renderCheck(result)).toMatch(/Gate: PASSED\s+Drift: PRESENT/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("leaves an equivalent baseline byte-for-byte unchanged", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-baseline-idempotent-"));
    await cp(scannerFixture, root, { recursive: true });
    try {
      const first = await runBaseline(root);
      const before = await readFile(first.baselinePath, "utf8");
      const second = await runBaseline(root);
      expect(first.wroteBaseline).toBe(true);
      expect(second.wroteBaseline).toBe(false);
      expect(second.baseline.createdAt).toBe(first.baseline.createdAt);
      expect(await readFile(second.baselinePath, "utf8")).toBe(before);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not overwrite a malformed baseline as if it were absent", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-baseline-invalid-"));
    await cp(scannerFixture, root, { recursive: true });
    try {
      const state = join(root, ".coherent");
      await mkdir(state, { recursive: true });
      await writeFile(join(state, "baseline.json"), "{not json}\n", "utf8");
      await expect(runBaseline(root)).rejects.toThrow();
      await expect(readBaseline(root)).rejects.toHaveProperty("cause", expect.any(SyntaxError));
      expect(await readFile(join(state, "baseline.json"), "utf8")).toBe("{not json}\n");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects malformed baseline entries through the canonical reader", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-baseline-entry-invalid-"));
    await cp(scannerFixture, root, { recursive: true });
    try {
      const result = await runBaseline(root);
      const raw = JSON.parse(await readFile(result.baselinePath, "utf8")) as {
        findings: Array<Record<string, unknown>>;
      };
      delete raw.findings[0]?.severity;
      await writeFile(result.baselinePath, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
      await expect(readBaseline(root)).rejects.toThrow(/findings\[0\]\.severity/);
      await expect(runCheck(root)).rejects.toThrow(/findings\[0\]\.severity/);
      await expect(runBaseline(root)).rejects.toThrow(/findings\[0\]\.severity/);
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
