import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runDoctor } from "../src/doctor/run.js";
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
  it("reports stale discovery, version gaps, duplicates, orphans, and invalid semantic findings", async () => {
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
        join(backend, "findings.json"),
        `${JSON.stringify({
          generatedAt: "2026-01-01T00:00:00.000Z",
          root: ".",
          durationMs: 1,
          findings: [
            { fingerprint: "bbb", ruleId: "A08", identity: "one" },
            { fingerprint: "bbb", ruleId: "A08", identity: "two" },
          ],
        }, null, 2)}\n`,
        "utf8",
      );
      await writeFile(
        join(backend, "reviews.json"),
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
        }, null, 2)}\n`,
        "utf8",
      );
      await writeFile(
        join(backend, "semantic-findings.json"),
        `${JSON.stringify({ schemaVersion: 1, findings: [{ title: "nope" }] }, null, 2)}\n`,
        "utf8",
      );

      const result = await runDoctor(root);
      const codes = result.issues.map((issue) => issue.code);
      expect(codes).toContain("stale-discovery");
      expect(codes).toContain("baseline-versions");
      expect(codes).toContain("baseline-absolute-root");
      expect(codes).toContain("duplicate-fingerprint");
      expect(codes).toContain("orphan-review");
      expect(codes).toContain("invalid-semantic-finding");
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
