import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { runBaseline } from "../src/baseline/run.js";
import { expandWithImporters } from "../src/check/importers.js";
import { runCheck } from "../src/check/run.js";

const execFileAsync = promisify(execFile);
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

describe("check --changed", () => {
  it("scopes NEW/RESOLVED to git-diff files and does not resolve unscoped debt", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-changed-"));
    try {
      await writeTinyRepo(root);
      await gitInitCommit(root, "init");
      const baseline = await runBaseline(root);
      expect(baseline.baseline.findings.some((entry) => entry.symbols.includes("unusedKeep"))).toBe(
        true,
      );

      await writeFile(
        join(root, "src", "user.ts"),
        `import { sharedUsed } from "./used.js";
export function callShared(): string { return sharedUsed(); }
function brandNewDead(): number { return 1; }
`,
        "utf8",
      );

      const result = await runCheck(root, { changed: true });
      expect(result.scopedFiles).toContain("src/user.ts");
      expect(result.scopedFiles).not.toContain("src/keep.ts");
      expect(result.newFindings.some((item) => item.symbols.includes("brandNewDead"))).toBe(true);
      expect(result.resolvedFindings.some((item) => item.symbols.includes("unusedKeep"))).toBe(
        false,
      );
      expect(result.exitCode).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("includes importers so A08 still sees callers of a changed export", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-importers-"));
    try {
      await writeTinyRepo(root);
      await gitInitCommit(root, "init");
      await runBaseline(root);

      await writeFile(
        join(root, "src", "used.ts"),
        `export function sharedUsed(): string { return "ok"; }
function unusedInUsed(): number { return 2; }
`,
        "utf8",
      );

      const scoped = await expandWithImporters(root, ["src/used.ts"]);
      expect(scoped).toEqual(expect.arrayContaining(["src/used.ts", "src/user.ts"]));

      const result = await runCheck(root, { changed: true });
      expect(result.scopedFiles).toEqual(expect.arrayContaining(["src/used.ts", "src/user.ts"]));
      expect(result.newFindings.some((item) => item.symbols.includes("unusedInUsed"))).toBe(true);
      expect(
        result.newFindings.some(
          (item) => item.symbols.includes("sharedUsed") && item.ruleId === "A08",
        ),
      ).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("requires a git work tree", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-nogit-"));
    try {
      await writeTinyRepo(root);
      await runBaseline(root);
      await expect(runCheck(root, { changed: true })).rejects.toThrow(/git repository/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function writeTinyRepo(root: string): Promise<void> {
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({ name: "changed-app", type: "module" }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(join(root, "src", "keep.ts"), "function unusedKeep(): number { return 1; }\n", "utf8");
  await writeFile(
    join(root, "src", "used.ts"),
    'export function sharedUsed(): string { return "ok"; }\n',
    "utf8",
  );
  await writeFile(
    join(root, "src", "user.ts"),
    `import { sharedUsed } from "./used.js";
export function callShared(): string { return sharedUsed(); }
`,
    "utf8",
  );
}

async function gitInitCommit(root: string, message: string): Promise<void> {
  await execFileAsync("git", ["init", "-b", "main"], { cwd: root });
  await execFileAsync("git", [...gitIdentity, "add", "."], { cwd: root });
  await execFileAsync("git", [...gitIdentity, "commit", "-m", message], { cwd: root });
}
