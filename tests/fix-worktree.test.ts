import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { renderFixNext, runFixNext } from "../src/fix/run.js";

const execFileAsync = promisify(execFile);

describe("fix next worktree safety", () => {
  it("warns when the selected cleanup targets an already-modified file", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-fix-dirty-"));
    try {
      await writeFile(join(root, "package.json"), '{"name":"dirty-target"}\n');
      await writeFile(join(root, "dead.ts"), "function unused(): number { return 1; }\n");
      await execFileAsync("git", ["init", "-b", "main"], { cwd: root });
      await execFileAsync(
        "git",
        [
          "-c", "commit.gpgsign=false",
          "-c", "core.hooksPath=/dev/null",
          "-c", "user.name=test",
          "-c", "user.email=test@coherent.test",
          "add", ".",
        ],
        { cwd: root },
      );
      await execFileAsync(
        "git",
        [
          "-c", "commit.gpgsign=false",
          "-c", "core.hooksPath=/dev/null",
          "-c", "user.name=test",
          "-c", "user.email=test@coherent.test",
          "commit", "-m", "fixture",
        ],
        { cwd: root },
      );
      await writeFile(
        join(root, "dead.ts"),
        "function unused(): number { return 1; }\n\n",
      );

      const result = await runFixNext(root);
      expect(result.node?.likelyFiles).toContain("dead.ts");
      expect(result.dirtyTargetFiles).toEqual(["dead.ts"]);
      expect(renderFixNext(result)).toMatch(/WARNING:.*uncommitted changes/s);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not warn when the target is not a Git work tree", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-fix-nongit-"));
    try {
      await writeFile(join(root, "package.json"), '{"name":"nongit-target"}\n');
      await writeFile(join(root, "dead.ts"), "function unused(): number { return 1; }\n");
      const result = await runFixNext(root);
      expect(result.node?.likelyFiles).toContain("dead.ts");
      expect(result.dirtyTargetFiles).toEqual([]);
      expect(result.worktreeInspectionWarning).toBeUndefined();
      expect(renderFixNext(result)).not.toMatch(/WARNING/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
