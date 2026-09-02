import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  artifactVersions,
  DETECTOR_REVISION,
  detectorRevisionForRule,
  FINGERPRINT_VERSION,
} from "../src/config.js";
import { runDoctor } from "../src/doctor/run.js";
import { runInit } from "../src/init/run.js";

const execFileAsync = promisify(execFile);
const expressFixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "express-app",
);
const gitIdentity = [
  "-c",
  "commit.gpgsign=false",
  "-c",
  "core.hooksPath=/dev/null",
  "-c",
  "user.name=test",
  "-c",
  "user.email=test@coherent.test",
];

describe("doctor Git snapshots", () => {
  it("rejects a staged artifact that omits the compatible baseline", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-doctor-staged-"));
    await cp(expressFixture, root, { recursive: true });
    try {
      await runInit(root);
      const state = join(root, ".coherent");
      const baselinePath = join(state, "baseline.json");
      const oldBaseline = {
        ...artifactVersions(),
        detectorRevision: DETECTOR_REVISION - 1,
        ruleDetectorRevisions: {
          ...artifactVersions().ruleDetectorRevisions,
          A06: detectorRevisionForRule("A06") - 1,
        },
        createdAt: "2026-09-01T00:00:00.000Z",
        findings: [],
      };
      await writeFile(baselinePath, `${JSON.stringify(oldBaseline, null, 2)}\n`);
      await execFileAsync("git", ["init", "-b", "main"], { cwd: root });
      await execFileAsync("git", [...gitIdentity, "add", "."], { cwd: root });
      await execFileAsync("git", [...gitIdentity, "commit", "-m", "old baseline"], { cwd: root });

      const review = {
        fingerprint: "reviewed-under-current-detector",
        ruleId: "A06",
        identity: "duplicate-rep:Current+State",
        decision: "dismissed",
        reason: "Reviewed under the current detector.",
        reviewedAt: "2026-09-01T00:01:00.000Z",
        fingerprintVersion: FINGERPRINT_VERSION,
        detectorRevision: DETECTOR_REVISION,
        ruleDetectorRevision: detectorRevisionForRule("A06"),
      };
      await writeFile(
        join(state, "decisions.json"),
        `${JSON.stringify({ schemaVersion: 1, reviews: [review], findings: [] }, null, 2)}\n`,
      );
      await execFileAsync("git", ["add", ".coherent/decisions.json"], { cwd: root });
      await writeFile(
        baselinePath,
        `${JSON.stringify({ ...oldBaseline, ...artifactVersions() }, null, 2)}\n`,
      );

      const worktree = await runDoctor(root);
      expect(worktree.ok).toBe(true);
      expect(worktree.target).toMatchObject({ kind: "worktree", worktreeDirty: true });

      const staged = await runDoctor(root, { staged: true });
      expect(staged.target.kind).toBe("staged");
      expect(staged.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
        "baseline-versions",
        "state-version-skew",
      ]));

      const committed = await runDoctor(root, { ref: "HEAD" });
      expect(committed.target).toMatchObject({ kind: "ref", ref: "HEAD" });
      expect(committed.issues.some((issue) => issue.code === "baseline-versions")).toBe(true);
      expect(JSON.parse(await readFile(baselinePath, "utf8"))).toMatchObject({
        detectorRevision: DETECTOR_REVISION,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
