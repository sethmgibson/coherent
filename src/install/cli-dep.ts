import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { portableRuntimeIdentity } from "../runtime.js";
import type { CopyResult } from "./copy.js";
import { defaultRunCommand, type RunCommandFn } from "./exec.js";
import {
  GITHUB_PACKAGE_SPEC,
  addCliCommand,
  cliInstallArgv,
  isSameCoherentPackageSpec,
  resolveInstallManager,
  type ProjectManager,
  type SupportedManager,
} from "./spec.js";

export type { ProjectManager, SupportedManager };

export interface CliDependencyResult {
  action: CopyResult;
  manager: ProjectManager;
  resolvedManager: SupportedManager;
  specifier: string;
  addCommand: string;
  argv: string[];
  alreadyPresent: boolean;
  installed: boolean;
  handshakeVerified: boolean;
  skillsOnly: boolean;
}

export interface ProjectCliOptions {
  runCommand?: RunCommandFn;
}

export function skillsOnlyCliResult(root: string, manager: ProjectManager): CliDependencyResult {
  const dest = join(root, "package.json");
  const resolvedManager = resolveInstallManager(manager);
  return {
    action: { path: dest, action: "skipped", reason: "skills-only" },
    manager,
    resolvedManager,
    specifier: GITHUB_PACKAGE_SPEC,
    addCommand: addCliCommand(manager),
    argv: [],
    alreadyPresent: false,
    installed: false,
    handshakeVerified: false,
    skillsOnly: true,
  };
}

export async function installProjectCli(
  root: string,
  options: ProjectCliOptions = {},
): Promise<CliDependencyResult> {
  const dest = join(root, "package.json");
  const manager = await detectRootPackageManager(root);
  const resolvedManager = resolveInstallManager(manager);
  const run = options.runCommand ?? defaultRunCommand;
  const existing = await readPackageJson(dest);
  if (existing === "malformed") {
    throw new Error(
      "package.json is not valid JSON. Fix it before project adoption, or pass --skills-only if you only want skill files.",
    );
  }

  let alreadyPresent = false;
  if (existing !== "missing") {
    const current = declaredCoherentSpec(existing);
    if (typeof current === "string") {
      if (!isSameCoherentPackageSpec(current)) {
        throw new Error(
          `package.json already declares coherent as ${JSON.stringify(current)}. ` +
            `Project adoption requires ${GITHUB_PACKAGE_SPEC} and will not overwrite a different specifier. ` +
            "Remove or align that dependency, or pass --skills-only.",
        );
      }
      alreadyPresent = true;
    }
  }

  const invocation = cliInstallArgv(manager);
  try {
    await run(invocation.command, invocation.args, { cwd: root });
  } catch (error) {
    throw new Error(
      `Failed to install ${GITHUB_PACKAGE_SPEC} with ${resolvedManager}. ` +
        `Skill files were not copied. ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  const after = await readPackageJson(dest);
  if (after === "missing" || after === "malformed") {
    throw new Error(
      `Package manager ${resolvedManager} finished but package.json is missing or invalid. Project adoption did not succeed.`,
    );
  }
  const recorded = declaredCoherentSpec(after);
  if (typeof recorded !== "string") {
    throw new Error(
      `Package manager ${resolvedManager} finished but package.json does not declare a coherent dependency.`,
    );
  }

  return {
    action: {
      path: dest,
      action: existing === "missing" ? "wrote" : alreadyPresent ? "unchanged" : "updated",
    },
    manager,
    resolvedManager,
    specifier: recorded,
    addCommand: addCliCommand(manager),
    argv: [invocation.command, ...invocation.args],
    alreadyPresent,
    installed: true,
    handshakeVerified: false,
    skillsOnly: false,
  };
}

export async function verifyProjectCliHandshake(
  root: string,
  options: ProjectCliOptions = {},
): Promise<void> {
  const run = options.runCommand ?? defaultRunCommand;
  const bin = projectLocalCliPath(root);
  try {
    await access(bin);
  } catch {
    throw new Error(
      `Installed ${GITHUB_PACKAGE_SPEC} but node_modules/.bin/coherent is missing. Project adoption is incomplete.`,
    );
  }
  const runtime = portableRuntimeIdentity();
  const args = [
    "version",
    root,
    "--json",
    "--expect-workflow",
    String(runtime.workflowRevision),
    "--expect-detector",
    String(runtime.detectorRevision),
    "--require-capability",
    ...runtime.capabilities,
  ];
  let stdout: string;
  try {
    ({ stdout } = await run(bin, args, { cwd: root }));
  } catch (error) {
    throw new Error(
      `Project-local coherent version handshake failed. ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  let parsed: { compatible?: unknown };
  try {
    parsed = JSON.parse(stdout) as { compatible?: unknown };
  } catch {
    throw new Error("Project-local coherent version handshake did not return JSON.");
  }
  if (parsed.compatible !== true) {
    throw new Error("Project-local coherent version handshake reported incompatible.");
  }
}

export function projectLocalCliPath(root: string): string {
  const name = process.platform === "win32" ? "coherent.cmd" : "coherent";
  return join(root, "node_modules", ".bin", name);
}

export async function detectRootPackageManager(root: string): Promise<ProjectManager> {
  if (await exists(join(root, "pnpm-lock.yaml")) || await exists(join(root, "pnpm-workspace.yaml"))) {
    return "pnpm";
  }
  if (await exists(join(root, "yarn.lock"))) return "yarn";
  if (await exists(join(root, "bun.lock")) || await exists(join(root, "bun.lockb"))) return "bun";
  if (await exists(join(root, "package-lock.json"))) return "npm";
  const pkg = await readPackageJson(join(root, "package.json"));
  if (pkg !== "missing" && pkg !== "malformed") {
    const field = pkg.packageManager;
    if (typeof field === "string") {
      if (field.startsWith("pnpm")) return "pnpm";
      if (field.startsWith("yarn")) return "yarn";
      if (field.startsWith("bun")) return "bun";
      if (field.startsWith("npm")) return "npm";
    }
  }
  return "unknown";
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  packageManager?: string;
  [key: string]: unknown;
}

function declaredCoherentSpec(pkg: PackageJson): string | undefined {
  const current =
    pkg.dependencies?.coherent
    ?? pkg.devDependencies?.coherent
    ?? pkg.optionalDependencies?.coherent
    ?? pkg.peerDependencies?.coherent;
  return typeof current === "string" ? current : undefined;
}

async function readPackageJson(path: string): Promise<PackageJson | "missing" | "malformed"> {
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return "malformed";
    return raw as PackageJson;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    if (error instanceof SyntaxError) return "malformed";
    throw error;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
