import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { projectLocalCliPath } from "../src/install/cli-dep.js";
import type { RunCommandFn } from "../src/install/exec.js";
import { GITHUB_PACKAGE_SPEC } from "../src/install/spec.js";
import { isInteractive } from "../src/install/prompt.js";
import { runInstall, runUpdate } from "../src/install/run.js";

const execFileAsync = promisify(execFile);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(repoRoot, "src", "cli.ts");
const tsx = join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");

function fakeRunCommand(): RunCommandFn {
  return async (_file, args, options) => {
    if (args[0] === "version") {
      return { stdout: JSON.stringify({ compatible: true, issues: [] }), stderr: "" };
    }
    const spec = args[args.length - 1] ?? GITHUB_PACKAGE_SPEC;
    const dest = join(options.cwd, "package.json");
    let pkg: { devDependencies?: Record<string, string>; private?: boolean } = { private: true };
    try {
      pkg = JSON.parse(await readFile(dest, "utf8")) as typeof pkg;
    } catch {
      // create a manifest the way a package manager would
    }
    await writeFile(
      dest,
      `${JSON.stringify({ ...pkg, devDependencies: { ...pkg.devDependencies, coherent: spec } }, null, 2)}\n`,
    );
    await mkdir(join(options.cwd, "node_modules", ".bin"), { recursive: true });
    await writeFile(projectLocalCliPath(options.cwd), "#!/bin/sh\n");
    return { stdout: "", stderr: "" };
  };
}

async function isolatedRoots(prefix: string): Promise<{ root: string; home: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), `${prefix}-root-`));
  const home = await mkdtemp(join(tmpdir(), `${prefix}-home-`));
  return {
    root,
    home,
    cleanup: async () => {
      await rm(root, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
    },
  };
}

describe("install onboarding", () => {
  it("does not prompt or write on a non-TTY without adoption flags", async () => {
    const { root, home, cleanup } = await isolatedRoots("coherent-nontty");
    try {
      expect(isInteractive(false)).toBe(false);
      const result = await runInstall(root, { home, pathEnv: "", interactive: false });
      expect(result.adoption).toBeUndefined();
      expect(result.actions).toEqual([]);
      expect(await readdir(root)).toEqual([]);
      expect(await readdir(home)).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it("uses both providers and project scope when --yes sees no harnesses", async () => {
    const { root, home, cleanup } = await isolatedRoots("coherent-yes-default");
    try {
      const result = await runInstall(root, { home, pathEnv: "", yes: true, runCommand: fakeRunCommand() });
      expect(result.adoption).toMatchObject({ providers: ["codex", "cursor"], scope: "project" });
      expect(await readFile(join(root, ".agents", "skills", "coherent", "SKILL.md"), "utf8")).toContain("name: coherent");
      expect(await readFile(join(root, ".cursor", "skills", "coherent", "SKILL.md"), "utf8")).toContain("name: coherent");
    } finally {
      await cleanup();
    }
  });

  it("copies the skill tree with working relative references and is idempotent", async () => {
    const { root, home, cleanup } = await isolatedRoots("coherent-skill-tree");
    try {
      const first = await runInstall(root, {
        home,
        pathEnv: "",
        yes: true,
        providers: "codex, cursor",
        scope: "project",
        runCommand: fakeRunCommand(),
      });
      expect(first.adoption).toMatchObject({ providers: ["codex", "cursor"], scope: "project" });
      const skill = join(root, ".agents", "skills", "coherent", "SKILL.md");
      const taxonomy = join(root, ".agents", "skills", "coherent", "reference", "taxonomy.md");
      const cursorSkill = join(root, ".cursor", "skills", "coherent", "SKILL.md");
      const text = await readFile(skill, "utf8");
      expect(text).toContain("reference/taxonomy.md");
      expect(text).not.toContain("../../../skills/coherent/SKILL.md");
      expect(await readFile(taxonomy, "utf8")).toContain("A08");
      expect(await readFile(cursorSkill, "utf8")).toContain("name: coherent");
      const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
        devDependencies: { coherent: string };
      };
      expect(manifest.devDependencies.coherent).toBe(GITHUB_PACKAGE_SPEC);

      const second = await runInstall(root, {
        home,
        pathEnv: "",
        yes: true,
        providers: "codex,cursor",
        scope: "project",
        runCommand: fakeRunCommand(),
      });
      expect(second.actions.every((action) => action.action === "unchanged")).toBe(true);
      expect(await readdir(home)).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it("installs into directories with spaces and leaves user-authored files alone", async () => {
    const parent = await mkdtemp(join(tmpdir(), "coherent spaces "));
    const root = join(parent, "project dir");
    const home = join(parent, "home dir");
    try {
      await mkdir(root);
      await mkdir(home);
      await runInstall(root, {
        home,
        pathEnv: "",
        yes: true,
        providers: "codex",
        scope: "project",
        runCommand: fakeRunCommand(),
      });
      const skillDir = join(root, ".agents", "skills", "coherent");
      await writeFile(join(skillDir, "notes.md"), "keep me\n", "utf8");
      await writeFile(join(skillDir, "SKILL.md"), "my custom skill\n", "utf8");
      const result = await runUpdate(root, { home, pathEnv: "", yes: true, providers: "codex", scope: "project" });
      expect(result.actions.find((action) => action.path.endsWith("SKILL.md"))).toMatchObject({
        action: "skipped",
        reason: "user edits",
      });
      expect(await readFile(join(skillDir, "SKILL.md"), "utf8")).toBe("my custom skill\n");
      expect(await readFile(join(skillDir, "notes.md"), "utf8")).toBe("keep me\n");
      expect(await readFile(join(skillDir, "reference", "taxonomy.md"), "utf8")).toContain("Dead code");
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("fails project adoption on malformed package.json and keeps global skills-only", async () => {
    const { root, home, cleanup } = await isolatedRoots("coherent-malformed");
    try {
      await writeFile(join(root, "package.json"), "{not json", "utf8");
      await expect(
        runInstall(root, {
          home,
          pathEnv: "",
          yes: true,
          providers: "codex",
          scope: "project",
          runCommand: fakeRunCommand(),
        }),
      ).rejects.toThrow(/package\.json is not valid JSON/);
      expect(await readFile(join(root, "package.json"), "utf8")).toBe("{not json");

      const global = await runInstall(root, {
        home,
        pathEnv: "",
        yes: true,
        providers: "cursor",
        scope: "global",
      });
      expect(global.cli).toBeUndefined();
      expect(await readFile(join(home, ".cursor", "skills", "coherent", "SKILL.md"), "utf8")).toContain(
        "name: coherent",
      );
      expect(await readdir(join(root, ".cursor"), { recursive: true }).catch(() => [])).not.toContain("SKILL.md");
    } finally {
      await cleanup();
    }
  });

  it("uses injected prompt answers and refuses to prompt when not interactive", async () => {
    const { root, home, cleanup } = await isolatedRoots("coherent-prompt");
    try {
      await mkdir(join(root, ".cursor"));
      const questions: string[] = [];
      const answers = ["detected", "global"];
      const result = await runInstall(root, {
        home,
        pathEnv: "",
        interactive: true,
        ask: (question) => {
          questions.push(question);
          return Promise.resolve(answers.shift() ?? "");
        },
      });
      expect(questions[0]).toMatch(/detected only/);
      expect(questions[1]).toMatch(/project|global/);
      expect(result.adoption).toMatchObject({ providers: ["cursor"], scope: "global" });
      expect(await readFile(join(home, ".cursor", "skills", "coherent", "SKILL.md"), "utf8")).toContain(
        "name: coherent",
      );

      const refused = await runInstall(root, {
        home,
        pathEnv: "",
        interactive: false,
        ask: () => Promise.resolve("cursor"),
      });
      expect(refused.adoption).toBeUndefined();
      expect(refused.actions).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it("preserves explicit integration flags next to adoption", async () => {
    const { root, home, cleanup } = await isolatedRoots("coherent-explicit");
    try {
      const result = await runInstall(root, {
        home,
        pathEnv: "",
        yes: true,
        providers: "cursor",
        scope: "project",
        alias: true,
        runCommand: fakeRunCommand(),
      });
      const paths = result.actions.map((action) => action.path);
      expect(paths).toContain(".cursor/skills/coherent/SKILL.md");
      expect(paths).toContain(".cursor/skills/backend/SKILL.md");
    } finally {
      await cleanup();
    }
  });
});

describe("install CLI onboarding", () => {
  it("rejects unknown providers on a non-TTY without hanging", async () => {
    const { root, home, cleanup } = await isolatedRoots("coherent-cli-bad");
    try {
      const result = await execFileAsync(process.execPath, [tsx, cli, "install", root, "--providers=claude"], {
        cwd: repoRoot,
        env: { ...process.env, HOME: home },
      }).then(
        (ok) => ({ code: 0, stdout: ok.stdout, stderr: ok.stderr }),
        (error: { code?: number; stdout?: string; stderr?: string }) => ({
          code: error.code ?? 1,
          stdout: error.stdout ?? "",
          stderr: error.stderr ?? "",
        }),
      );
      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/Unknown provider/);
      expect(await readdir(root)).toEqual([]);
      expect(await readdir(home)).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it("installs from the public command shape with --yes in an isolated HOME", async () => {
    const { root, home, cleanup } = await isolatedRoots("coherent-cli-yes");
    const fakeBin = await mkdtemp(join(tmpdir(), "coherent-fake-npm-"));
    try {
      await writeFile(
        join(fakeBin, "npm"),
        `#!/usr/bin/env node
const { chmodSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const cwd = process.cwd();
const spec = process.argv[process.argv.length - 1];
let pkg = { private: true };
try { pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")); } catch {}
pkg.devDependencies = { ...pkg.devDependencies, coherent: spec };
writeFileSync(join(cwd, "package.json"), JSON.stringify(pkg, null, 2) + "\\n");
mkdirSync(join(cwd, "node_modules", ".bin"), { recursive: true });
const bin = join(cwd, "node_modules", ".bin", "coherent");
writeFileSync(bin, "#!/usr/bin/env node\\nconsole.log(JSON.stringify({ compatible: true, issues: [] }))\\n");
chmodSync(bin, 0o755);
`,
        "utf8",
      );
      await chmod(join(fakeBin, "npm"), 0o755);
      await execFileAsync("git", ["init", "-b", "main"], { cwd: root });
      const result = await execFileAsync(
        process.execPath,
        [tsx, cli, "install", root, "--providers=codex,cursor", "--scope=project", "--yes"],
        { cwd: repoRoot, env: { ...process.env, HOME: home, PATH: `${fakeBin}:${process.env.PATH ?? ""}` } },
      );
      expect(result.stdout).toContain(GITHUB_PACKAGE_SPEC);
      expect(result.stdout).toContain("verified project-local CLI handshake");
      expect(result.stdout).not.toContain("add the CLI with");
      expect(result.stdout).toMatch(/\$coherent init|\/coherent init/);
      expect(await readFile(join(root, ".agents", "skills", "coherent", "reference", "runtime.md"), "utf8"))
        .toContain("coherent version");
      expect(await readdir(home)).toEqual([]);
    } finally {
      await cleanup();
      await rm(fakeBin, { recursive: true, force: true });
    }
  });
});
