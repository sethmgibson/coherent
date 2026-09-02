import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectRootPackageManager, projectLocalCliPath } from "../src/install/cli-dep.js";
import { GITHUB_PACKAGE_SPEC } from "../src/install/spec.js";
import { renderInstall, runInstall, runUpdate } from "../src/install/run.js";
import type { RunCommandFn } from "../src/install/exec.js";

interface RecordedCall {
  file: string;
  args: string[];
  cwd: string;
}

function createFakeRunCommand(options: {
  failInstall?: boolean;
  failHandshake?: boolean;
  handshakeStdout?: string;
} = {}): { runCommand: RunCommandFn; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const runCommand: RunCommandFn = async (file, args, execOptions) => {
    calls.push({ file, args: [...args], cwd: execOptions.cwd });
    if (args[0] === "version") {
      if (options.failHandshake === true) throw new Error("handshake failed");
      const stdout = options.handshakeStdout ?? JSON.stringify({ compatible: true, issues: [] });
      return { stdout, stderr: "" };
    }
    if (options.failInstall === true) throw new Error("package manager failed");
    const spec = args[args.length - 1] ?? GITHUB_PACKAGE_SPEC;
    const dest = join(execOptions.cwd, "package.json");
    let pkg: { devDependencies?: Record<string, string>; private?: boolean } = { private: true };
    try {
      pkg = JSON.parse(await readFile(dest, "utf8")) as typeof pkg;
    } catch {
      // missing manifest; simulate the package manager creating one
    }
    await writeFile(
      dest,
      `${JSON.stringify({ ...pkg, devDependencies: { ...pkg.devDependencies, coherent: spec } }, null, 2)}\n`,
    );
    const bin = projectLocalCliPath(execOptions.cwd);
    await mkdir(join(execOptions.cwd, "node_modules", ".bin"), { recursive: true });
    await writeFile(bin, "#!/bin/sh\n");
    return { stdout: "", stderr: "" };
  };
  return { runCommand, calls };
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

describe("project CLI install", () => {
  it("runs each package manager with fixed argv, including paths with spaces", async () => {
    const cases: { lockfile: string; command: string; args: string[] }[] = [
      { lockfile: "pnpm-lock.yaml", command: "pnpm", args: ["add", "--save-dev", GITHUB_PACKAGE_SPEC] },
      { lockfile: "package-lock.json", command: "npm", args: ["install", "--save-dev", GITHUB_PACKAGE_SPEC] },
      { lockfile: "yarn.lock", command: "yarn", args: ["add", "--dev", GITHUB_PACKAGE_SPEC] },
      { lockfile: "bun.lock", command: "bun", args: ["add", "--dev", GITHUB_PACKAGE_SPEC] },
    ];
    for (const testCase of cases) {
      const parent = await mkdtemp(join(tmpdir(), "coherent manager "));
      const root = join(parent, "project dir");
      const home = join(parent, "home dir");
      try {
        await mkdir(root);
        await mkdir(home);
        await writeFile(join(root, testCase.lockfile), "lock\n", "utf8");
        const { runCommand, calls } = createFakeRunCommand();
        const result = await runInstall(root, {
          home,
          pathEnv: "",
          yes: true,
          providers: "codex",
          scope: "project",
          runCommand,
        });
        expect(calls[0]).toEqual({
          file: testCase.command,
          args: testCase.args,
          cwd: root,
        });
        expect(calls[0]?.cwd).toContain("project dir");
        expect(calls[1]?.file).toBe(projectLocalCliPath(root));
        expect(calls[1]?.args[0]).toBe("version");
        expect(calls[1]?.args).toContain("--json");
        expect(result.cli).toMatchObject({
          installed: true,
          handshakeVerified: true,
          resolvedManager: testCase.command,
        });
        expect(renderInstall("Coherent install", result)).toContain(
          `installed ${GITHUB_PACKAGE_SPEC} with ${testCase.command}`,
        );
        expect(renderInstall("Coherent install", result)).not.toContain("add the CLI with");
      } finally {
        await rm(parent, { recursive: true, force: true });
      }
    }
  });

  it("defaults to npm when no lockfile exists and uses packageManager when present", async () => {
    const { root, home, cleanup } = await isolatedRoots("coherent-default-npm");
    try {
      const first = createFakeRunCommand();
      const untitled = await runInstall(root, {
        home,
        pathEnv: "",
        yes: true,
        providers: "codex",
        runCommand: first.runCommand,
      });
      expect(first.calls[0]?.file).toBe("npm");
      expect(untitled.cli?.manager).toBe("unknown");
      expect(untitled.cli?.resolvedManager).toBe("npm");

      const other = await mkdtemp(join(tmpdir(), "coherent-pm-field-"));
      try {
        await writeFile(
          join(other, "package.json"),
          `${JSON.stringify({ private: true, packageManager: "pnpm@10.13.1" }, null, 2)}\n`,
        );
        expect(await detectRootPackageManager(other)).toBe("pnpm");
      } finally {
        await rm(other, { recursive: true, force: true });
      }
    } finally {
      await cleanup();
    }
  });

  it("does not copy skills when the package manager fails", async () => {
    const { root, home, cleanup } = await isolatedRoots("coherent-cli-fail");
    try {
      const { runCommand, calls } = createFakeRunCommand({ failInstall: true });
      await expect(
        runInstall(root, {
          home,
          pathEnv: "",
          yes: true,
          providers: "codex",
          scope: "project",
          runCommand,
        }),
      ).rejects.toThrow(/Failed to install github:sethmgibson\/coherent/);
      expect(calls).toHaveLength(1);
      expect(await readdir(root)).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it("fails closed on a conflicting coherent specifier without changing package.json", async () => {
    const { root, home, cleanup } = await isolatedRoots("coherent-conflict");
    try {
      const manifest = `${JSON.stringify({ private: true, dependencies: { coherent: "^1.0.0" } }, null, 2)}\n`;
      await writeFile(join(root, "package.json"), manifest, "utf8");
      const { runCommand, calls } = createFakeRunCommand();
      await expect(
        runInstall(root, {
          home,
          pathEnv: "",
          yes: true,
          providers: "codex",
          scope: "project",
          runCommand,
        }),
      ).rejects.toThrow(/already declares coherent as "\^1\.0\.0"/);
      expect(calls).toEqual([]);
      expect(await readFile(join(root, "package.json"), "utf8")).toBe(manifest);
      expect(await readdir(root)).toEqual(["package.json"]);
    } finally {
      await cleanup();
    }
  });

  it("treats a similarly prefixed GitHub repo as a conflict", async () => {
    const { root, home, cleanup } = await isolatedRoots("coherent-prefix-conflict");
    try {
      const manifest = `${JSON.stringify({
        private: true,
        dependencies: { coherent: "github:sethmgibson/coherent-evil" },
      }, null, 2)}\n`;
      await writeFile(join(root, "package.json"), manifest, "utf8");
      const { runCommand, calls } = createFakeRunCommand();
      await expect(
        runInstall(root, {
          home,
          pathEnv: "",
          yes: true,
          providers: "codex",
          scope: "project",
          runCommand,
        }),
      ).rejects.toThrow(/already declares coherent as "github:sethmgibson\/coherent-evil"/);
      expect(calls).toEqual([]);
      expect(await readFile(join(root, "package.json"), "utf8")).toBe(manifest);
    } finally {
      await cleanup();
    }
  });

  it("keeps a same-repo pin and installs that specifier", async () => {
    const { root, home, cleanup } = await isolatedRoots("coherent-pin");
    try {
      const pinned = "github:sethmgibson/coherent#abc123";
      await writeFile(
        join(root, "package.json"),
        `${JSON.stringify({ private: true, devDependencies: { coherent: pinned } }, null, 2)}\n`,
      );
      const { runCommand, calls } = createFakeRunCommand();
      const result = await runInstall(root, {
        home,
        pathEnv: "",
        yes: true,
        providers: "codex",
        scope: "project",
        runCommand,
      });
      expect(calls[0]?.args.at(-1)).toBe(pinned);
      expect(result.cli).toMatchObject({ alreadyPresent: true, specifier: pinned, handshakeVerified: true });
      expect(JSON.parse(await readFile(join(root, "package.json"), "utf8"))).toMatchObject({
        devDependencies: { coherent: pinned },
      });
    } finally {
      await cleanup();
    }
  });

  it("fails project adoption on malformed package.json instead of reporting success", async () => {
    const { root, home, cleanup } = await isolatedRoots("coherent-malformed-cli");
    try {
      await writeFile(join(root, "package.json"), "{not json", "utf8");
      const { runCommand, calls } = createFakeRunCommand();
      await expect(
        runInstall(root, {
          home,
          pathEnv: "",
          yes: true,
          providers: "codex",
          scope: "project",
          runCommand,
        }),
      ).rejects.toThrow(/package\.json is not valid JSON/);
      expect(calls).toEqual([]);
      expect(await readFile(join(root, "package.json"), "utf8")).toBe("{not json");
      await expect(readdir(join(root, ".agents"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await cleanup();
    }
  });

  it("copies skills only when --skills-only is set and keeps global scope skills-only", async () => {
    const { root, home, cleanup } = await isolatedRoots("coherent-skills-only");
    try {
      const { runCommand, calls } = createFakeRunCommand();
      const project = await runInstall(root, {
        home,
        pathEnv: "",
        yes: true,
        providers: "codex",
        scope: "project",
        skillsOnly: true,
        runCommand,
      });
      expect(calls).toEqual([]);
      expect(project.cli).toMatchObject({ skillsOnly: true, installed: false, handshakeVerified: false });
      expect(await readFile(join(root, ".agents", "skills", "coherent", "SKILL.md"), "utf8")).toContain(
        "name: coherent",
      );
      expect(renderInstall("Coherent install", project)).toContain("skills only");
      await expect(readFile(join(root, "package.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });

      const global = await runInstall(root, {
        home,
        pathEnv: "",
        yes: true,
        providers: "cursor",
        scope: "global",
        runCommand,
      });
      expect(global.cli).toBeUndefined();
      expect(renderInstall("Coherent install", global)).toContain(
        "global skill files do not install the Coherent CLI",
      );
      expect(await readFile(join(home, ".cursor", "skills", "coherent", "SKILL.md"), "utf8")).toContain(
        "name: coherent",
      );
    } finally {
      await cleanup();
    }
  });

  it("does not install or refresh the CLI during update", async () => {
    const { root, home, cleanup } = await isolatedRoots("coherent-update-no-cli");
    try {
      const first = createFakeRunCommand();
      await runInstall(root, {
        home,
        pathEnv: "",
        yes: true,
        providers: "codex",
        runCommand: first.runCommand,
      });
      const second = createFakeRunCommand();
      const updated = await runUpdate(root, {
        home,
        pathEnv: "",
        yes: true,
        providers: "codex",
        runCommand: second.runCommand,
      });
      expect(second.calls).toEqual([]);
      expect(updated.cli).toBeUndefined();
      expect(renderInstall("Coherent update", updated)).toContain("does not update the Coherent CLI package");
    } finally {
      await cleanup();
    }
  });

  it("fails the handshake after a successful CLI install without claiming adoption", async () => {
    const { root, home, cleanup } = await isolatedRoots("coherent-handshake-fail");
    try {
      const { runCommand } = createFakeRunCommand({ failHandshake: true });
      await expect(
        runInstall(root, {
          home,
          pathEnv: "",
          yes: true,
          providers: "codex",
          runCommand,
        }),
      ).rejects.toThrow(/handshake failed/);
      expect(JSON.parse(await readFile(join(root, "package.json"), "utf8"))).toMatchObject({
        devDependencies: { coherent: GITHUB_PACKAGE_SPEC },
      });
      await expect(readdir(join(root, ".agents"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await cleanup();
    }
  });
});
