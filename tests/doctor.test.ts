import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runDoctor } from "../src/doctor/run.js";
import { createFinding } from "../src/domain/finding.js";
import { runInit } from "../src/init/run.js";

const expressFixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "express-app",
);

async function seededRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "coherent-doctor-"));
  await cp(expressFixture, root, { recursive: true });
  await runInit(root);
  return root;
}

describe("doctor", () => {
  it("treats the baseline as optional", async () => {
    const root = await seededRoot();
    try {
      const result = await runDoctor(root);
      expect(result.issues.some((issue) => issue.code.includes("baseline"))).toBe(false);
      expect(result.ok).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reports stale discovery, version gaps, baseline duplicates, and orphan reviews", async () => {
    const root = await seededRoot();
    try {
      const backend = join(root, ".coherent");
      await mkdir(backend, { recursive: true });

      const pkgPath = join(root, "package.json");
      const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as {
        dependencies?: Record<string, string>;
      };
      pkg.dependencies = { ...(pkg.dependencies ?? {}), extra: "1.0.0" };
      await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

      await writeFile(
        join(backend, "baseline.json"),
        `${JSON.stringify({
          createdAt: "2026-01-01T00:00:00.000Z",
          root,
          findings: [
            { fingerprint: "aaa", ruleId: "A08", identity: "x", title: "x" },
            { fingerprint: "aaa", ruleId: "A08", identity: "y", title: "y" },
          ],
        }, null, 2)}\n`,
        "utf8",
      );
      await writeFile(
        join(backend, "decisions.json"),
        `${JSON.stringify({
          schemaVersion: 1,
          reviews: [
            {
              fingerprint: "missing-fp",
              ruleId: "A06",
              identity: "duplicate-rep:Ghost+Pair",
              decision: "dismissed",
              reason: "gone",
              reviewedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
          findings: [],
        }, null, 2)}\n`,
        "utf8",
      );

      const result = await runDoctor(root, { deep: true });
      const codes = result.issues.map((issue) => issue.code);
      expect(codes).toContain("stale-discovery");
      expect(codes).toContain("baseline-versions");
      expect(codes).toContain("baseline-absolute-root");
      expect(codes).toContain("duplicate-fingerprint");
      expect(codes).toContain("orphan-review");
      expect(result.ok).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reports a stale identity-only review when detectorRevision does not match", async () => {
    const root = await seededRoot();
    try {
      const backend = join(root, ".coherent");
      const target = createFinding({
        ruleId: "A06",
        identity: "duplicate-rep:Foo+Bar",
        title: "Duplicate representations",
        severity: "medium",
        confidence: "high",
        detectionMode: "hybrid",
        status: "candidate",
        explanation: "Test semantic finding.",
        evidence: { summary: "Test evidence." },
        locations: [{ file: "src/old.ts", symbol: "Foo" }],
        affectedSymbols: ["Foo", "Bar"],
        cleanupBenefit: "Smaller architecture.",
        changeRisk: "Review callers.",
        prerequisiteFindingIds: [],
      });
      await writeFile(
        join(backend, "decisions.json"),
        `${JSON.stringify({
          schemaVersion: 1,
          reviews: [
            {
              fingerprint: "old-fp",
              ruleId: target.ruleId,
              identity: target.identity,
              decision: "dismissed",
              reason: "intentionally distinct",
              reviewedAt: "2026-01-01T00:00:00.000Z",
              detectorRevision: 99,
            },
          ],
          findings: [target],
        }, null, 2)}\n`,
      );

      const result = await runDoctor(root);
      const stale = result.issues.filter((issue) => issue.code === "stale-review");
      expect(stale).toHaveLength(1);
      expect(stale[0]?.message).toMatch(/detectorRevision 99/);
      expect(result.issues.some((issue) => issue.code === "orphan-review")).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a decisions file with a semantic finding missing planner fields", async () => {
    const root = await seededRoot();
    try {
      await writeFile(
        join(root, ".coherent", "decisions.json"),
        `${JSON.stringify({
          schemaVersion: 1,
          reviews: [],
          findings: [
            {
              ruleId: "A01",
              identity: "foo",
              title: "Foo",
              explanation: "Foo",
              locations: [],
              affectedSymbols: [],
            },
          ],
        }, null, 2)}\n`,
        "utf8",
      );
      const result = await runDoctor(root);
      const issue = result.issues.find((item) => item.code === "invalid-decisions");
      expect(issue?.message).toMatch(/Invalid finding/);
      expect(result.ok).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reports leftover .backend/ next to .coherent/", async () => {
    const root = await seededRoot();
    try {
      await mkdir(join(root, ".backend"), { recursive: true });
      const result = await runDoctor(root);
      expect(result.issues.some((issue) => issue.code === "legacy-state-dir")).toBe(true);
      expect(result.ok).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reports a lone .backend/ directory and asks for a rename", async () => {
    const root = await seededRoot();
    try {
      await rm(join(root, ".coherent"), { recursive: true, force: true });
      await mkdir(join(root, ".backend"), { recursive: true });
      const result = await runDoctor(root);
      const issue = result.issues.find((item) => item.code === "legacy-state-dir");
      expect(issue?.message).toMatch(/Rename it to \.coherent\//);
      expect(result.ok).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
