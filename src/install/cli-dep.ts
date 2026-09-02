import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CopyResult } from "./copy.js";
import { addCliCommand, GITHUB_PACKAGE_SPEC } from "./spec.js";

export type ProjectManager = "pnpm" | "npm" | "yarn" | "bun" | "unknown";

export interface CliDependencyResult {
  action: CopyResult;
  manager: ProjectManager;
  specifier: string;
  addCommand: string;
  alreadyPresent: boolean;
}

export async function ensureProjectCliSpecifier(root: string): Promise<CliDependencyResult> {
  const dest = join(root, "package.json");
  const manager = await detectRootPackageManager(root);
  const addCommand = addCliCommand(manager);
  const existing = await readPackageJson(dest);
  if (existing === "missing") {
    await writeFile(
      dest,
      `${JSON.stringify({ private: true, devDependencies: { coherent: GITHUB_PACKAGE_SPEC } }, null, 2)}\n`,
      "utf8",
    );
    return {
      action: { path: dest, action: "wrote" },
      manager,
      specifier: GITHUB_PACKAGE_SPEC,
      addCommand,
      alreadyPresent: false,
    };
  }
  if (existing === "malformed") {
    return {
      action: { path: dest, action: "skipped", reason: "package.json is not valid JSON" },
      manager,
      specifier: GITHUB_PACKAGE_SPEC,
      addCommand,
      alreadyPresent: false,
    };
  }
  const current = existing.dependencies?.coherent ?? existing.devDependencies?.coherent;
  if (typeof current === "string") {
    return {
      action: { path: dest, action: "unchanged" },
      manager,
      specifier: current,
      addCommand,
      alreadyPresent: true,
    };
  }
  const next = {
    ...existing,
    devDependencies: { ...existing.devDependencies, coherent: GITHUB_PACKAGE_SPEC },
  };
  await writeFile(dest, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return {
    action: { path: dest, action: "updated" },
    manager,
    specifier: GITHUB_PACKAGE_SPEC,
    addCommand,
    alreadyPresent: false,
  };
}

export async function detectRootPackageManager(root: string): Promise<ProjectManager> {
  if (await exists(join(root, "pnpm-lock.yaml")) || await exists(join(root, "pnpm-workspace.yaml"))) {
    return "pnpm";
  }
  if (await exists(join(root, "yarn.lock"))) return "yarn";
  if (await exists(join(root, "bun.lock")) || await exists(join(root, "bun.lockb"))) return "bun";
  if (await exists(join(root, "package-lock.json"))) return "npm";
  return "unknown";
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
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
