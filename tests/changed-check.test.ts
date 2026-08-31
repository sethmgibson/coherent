import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { runBaseline } from "../src/baseline/run.js";
import { expandWithImporters } from "../src/check/importers.js";
import { listChangedSourceFiles } from "../src/check/changed-files.js";
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
  it("preserves unicode, whitespace, and newline paths from git", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-changed-paths-"));
    try {
      await writeFile(join(root, "README.md"), "fixture\n");
      await gitInitCommit(root, "init");
      const paths = ["café.ts", " leading.ts", "line\nbreak.ts"];
      for (const path of paths) await writeFile(join(root, path), "export {};\n");
      expect((await listChangedSourceFiles(root)).existing.sort()).toEqual(paths.sort());
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("scopes git paths to a nested target repository", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-changed-nested-"));
    try {
      const child = join(root, "packages", "app");
      await mkdir(child, { recursive: true });
      await writeFile(join(child, "live.ts"), "export {};\n");
      await writeFile(join(root, "outside.ts"), "export {};\n");
      await gitInitCommit(root, "init");
      await writeFile(join(child, "live.ts"), "export const x = 1;\n");
      await writeFile(join(root, "outside.ts"), "export const y = 1;\n");
      expect(await listChangedSourceFiles(child)).toEqual({ existing: ["live.ts"], deleted: [] });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("includes both sides of staged renames in the drift scope", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-changed-rename-"));
    try {
      await writeFile(join(root, "old.ts"), "export {};\n");
      await gitInitCommit(root, "init");
      await execFileAsync("git", ["mv", "old.ts", "new.ts"], { cwd: root });
      expect(await listChangedSourceFiles(root)).toEqual({ existing: ["new.ts"], deleted: ["old.ts"] });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not classify unexpected filesystem failures as deleted files", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-changed-inaccessible-"));
    try {
      await writeFile(join(root, "README.md"), "fixture\n");
      await gitInitCommit(root, "init");
      await symlink("loop.ts", join(root, "loop.ts"));
      await expect(listChangedSourceFiles(root)).rejects.toMatchObject({ code: "ELOOP" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

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

  it("includes alias callers and transitive importers without inventing unused exports", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-importer-alias-"));
    try {
      await writeTinyRepo(root);
      await writeFile(join(root, "tsconfig.json"), JSON.stringify({
        compilerOptions: { baseUrl: ".", paths: { "@app/*": ["src/*"] } }, include: ["src/**/*.ts"],
      }));
      await writeFile(join(root, "src/user.ts"), 'import { sharedUsed } from "@app/used";\nexport function callShared() { return sharedUsed(); }\n');
      await writeFile(join(root, "src/consumer.ts"), 'import { callShared } from "./user.js";\nconsole.log(callShared());\n');
      await gitInitCommit(root, "init");
      await runBaseline(root);
      await writeFile(join(root, "src/used.ts"), 'export function sharedUsed(): string { return "changed"; }\n');

      const result = await runCheck(root, { changed: true });
      expect(result.scopedFiles).toEqual(expect.arrayContaining(["src/used.ts", "src/user.ts", "src/consumer.ts"]));
      expect(result.newFindings.filter((item) => item.ruleId === "A08")).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uses child tsconfig aliases across re-exports and terminates on importer cycles", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-importer-project-"));
    try {
      const child = join(root, "packages", "app");
      await mkdir(join(child, "src"), { recursive: true });
      await mkdir(join(root, "ignored"));
      await writeFile(join(root, "package.json"), '{"name":"workspace"}');
      await writeFile(join(root, "tsconfig.json"), JSON.stringify({ files: [], references: [{ path: "./packages/app" }] }));
      await writeFile(join(child, "tsconfig.json"), JSON.stringify({
        compilerOptions: { baseUrl: ".", paths: { "@app/*": ["src/*"] } }, include: ["src/**/*.ts"],
      }));
      await writeFile(join(child, "src/value.ts"), 'import "./barrel.js";\nexport const value = 1;\n');
      await writeFile(join(child, "src/barrel.ts"), 'export { value } from "@app/value";\n');
      await writeFile(join(child, "src/caller.ts"), 'import("@app/barrel").then(console.log);\n');
      await writeFile(join(root, "ignored/use.ts"), 'import "../packages/app/src/value.js";\n');
      const config = { ignore: ["ignored"] };
      expect(await expandWithImporters(root, ["packages/app/src/value.ts"], config)).toEqual([
        "packages/app/src/barrel.ts", "packages/app/src/caller.ts", "packages/app/src/value.ts",
      ]);
      expect(await expandWithImporters(root, ["ignored/use.ts"], config)).toEqual([]);
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
