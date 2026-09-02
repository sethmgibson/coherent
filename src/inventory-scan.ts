import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Inventory, PackageInfo, PackageManager } from "./inventory.js";
import { toPosix, type WalkedFile } from "./inventory-walk.js";

export const TS_LIKE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);

export const PYTHON_EXTENSIONS = new Set([".py"]);

export const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".py",
]);

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".mts": "TypeScript",
  ".cts": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".py": "Python",
};

export const FRAMEWORKS: { name: string; packages: string[] }[] = [
  { name: "NestJS", packages: ["@nestjs/core"] },
  { name: "Next.js", packages: ["next"] },
  { name: "Express", packages: ["express"] },
  { name: "Django", packages: ["django"] },
  { name: "FastAPI", packages: ["fastapi"] },
  { name: "Flask", packages: ["flask"] },
];

export const PERSISTENCE_PACKAGES = [
  "prisma",
  "@prisma/client",
  "typeorm",
  "drizzle-orm",
  "sequelize",
  "mongoose",
  "knex",
  "sqlalchemy",
  "psycopg",
  "psycopg2",
  "asyncpg",
  "pymongo",
];

const ENTRYPOINT_BASENAMES = new Set([
  "index.ts",
  "index.js",
  "main.ts",
  "main.js",
  "cli.ts",
  "cli.js",
  "app.ts",
  "app.js",
  "server.ts",
  "server.js",
  "app.module.ts",
  "__main__.py",
  "main.py",
  "app.py",
  "manage.py",
  "wsgi.py",
  "asgi.py",
]);

export async function readPackages(
  root: string,
  packageJsonFiles: string[],
): Promise<PackageInfo[]> {
  const packages: PackageInfo[] = [];
  for (const relativePath of packageJsonFiles) {
    const raw = await readFile(join(root, relativePath), "utf8");
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch (error) {
      throw new Error(`Incomplete inventory: invalid package manifest ${relativePath}.`, {
        cause: error,
      });
    }
    packages.push({
      path: relativePath,
      name: typeof parsed.name === "string" ? parsed.name : dirname(relativePath) || ".",
      dependencies: stringRecord(parsed.dependencies),
      devDependencies: stringRecord(parsed.devDependencies),
      bins: binEntries(parsed.bin),
      ...(typeof parsed.main === "string" ? { main: parsed.main } : {}),
      ...(parsed.exports !== undefined ? { exports: exportPaths(parsed.exports) } : {}),
    });
  }
  return packages;
}

export async function detectWorkspace(
  root: string,
  packages: PackageInfo[],
): Promise<Inventory["workspace"]> {
  const pnpmPath = join(root, "pnpm-workspace.yaml");
  if (await exists(pnpmPath)) {
    const text = await readFile(pnpmPath, "utf8");
    return {
      kind: "pnpm",
      patterns: parseWorkspaceGlobs(text),
      packages: packages.filter((pkg) => pkg.path !== "package.json").map((pkg) => pkg.path),
    };
  }

  const rootPackage = packages.find((pkg) => pkg.path === "package.json");
  if (!rootPackage) return null;
  const raw = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
    workspaces?: string[] | { packages?: string[] };
  };
  const patterns = Array.isArray(raw.workspaces)
    ? raw.workspaces
    : raw.workspaces?.packages ?? [];
  if (patterns.length === 0) return null;
  return {
    kind: "npm",
    patterns,
    packages: packages.filter((pkg) => pkg.path !== "package.json").map((pkg) => pkg.path),
  };
}

export function detectPackageManager(files: WalkedFile[]): PackageManager {
  const names = new Set(files.map((file) => file.name));
  const relative = new Set(files.map((file) => file.relativePath));
  if (relative.has("pnpm-lock.yaml") || relative.has("pnpm-workspace.yaml")) return "pnpm";
  if (names.has("yarn.lock")) return "yarn";
  if (names.has("bun.lock") || names.has("bun.lockb")) return "bun";
  if (names.has("package-lock.json")) return "npm";
  return "unknown";
}

export function detectLanguages(files: WalkedFile[]): string[] {
  const languages = new Set<string>();
  for (const file of files) {
    const language = LANGUAGE_BY_EXTENSION[extensionOf(file.name)];
    if (language) languages.add(language);
  }
  return [...languages].sort();
}

export function detectSourceDirectories(files: WalkedFile[]): string[] {
  const dirs = new Set<string>();
  for (const file of files) {
    if (!SOURCE_EXTENSIONS.has(extensionOf(file.name))) continue;
    const parts = file.relativePath.split("/");
    if (parts[0] === "src" || parts[0] === "lib" || parts[0] === "app") {
      dirs.add(parts[0]);
    }
    const pkgSrc = parts.findIndex((part, index) => index > 0 && part === "src");
    if (pkgSrc !== -1) {
      dirs.add(parts.slice(0, pkgSrc + 1).join("/"));
    }
    const top = parts[0];
    if (
      isPythonSource(file.name) &&
      !isTestPath(file.relativePath) &&
      parts.length >= 2 &&
      top &&
      top !== "src" &&
      top !== "lib" &&
      top !== "app"
    ) {
      dirs.add(top);
    }
  }
  return [...dirs].sort();
}

export function detectTestDirectories(files: WalkedFile[]): string[] {
  const dirs = new Set<string>();
  for (const file of files) {
    const parts = file.relativePath.split("/");
    const testIndex = parts.findIndex((part) =>
      /^(tests?|__tests__|spec|e2e)$/.test(part),
    );
    if (testIndex !== -1) {
      dirs.add(parts.slice(0, testIndex + 1).join("/"));
    }
  }
  return [...dirs].sort();
}

export function detectEntrypoints(
  packages: PackageInfo[],
  files: WalkedFile[],
): string[] {
  const found = new Set<string>();
  for (const pkg of packages) {
    const base = dirname(pkg.path) === "." ? "" : dirname(pkg.path);
    if (pkg.main) addEntrypoint(found, base, pkg.main);
    for (const exported of pkg.exports ?? []) {
      addEntrypoint(found, base, exported);
    }
    for (const bin of pkg.bins) {
      addEntrypoint(found, base, bin.path);
    }
  }
  for (const file of files) {
    if (ENTRYPOINT_BASENAMES.has(file.name) && !isTestPath(file.relativePath)) {
      const dir = dirname(file.relativePath);
      if (
        dir === "." ||
        dir === "src" ||
        dir.endsWith("/src") ||
        file.name === "app.module.ts" ||
        file.name === "manage.py" ||
        file.name === "__main__.py"
      ) {
        found.add(file.relativePath);
      }
    }
  }
  return [...found].sort();
}

export function detectTopLevelModules(
  files: WalkedFile[],
  sourceDirectories: string[],
): string[] {
  const modules = new Set<string>();
  for (const file of files) {
    const parts = file.relativePath.split("/");
    if (
      parts.length >= 3 &&
      (parts[0] === "src" || parts[0] === "packages" || parts[0] === "apps")
    ) {
      modules.add(`${parts[0]}/${parts[1]}`);
    }
  }
  for (const dir of sourceDirectories) {
    if (dir.includes("/")) modules.add(dir);
  }
  return [...modules].sort();
}

export function mergeDependencies(packages: PackageInfo[]): {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
} {
  const dependencies: Record<string, string> = {};
  const devDependencies: Record<string, string> = {};
  for (const pkg of packages) {
    Object.assign(dependencies, pkg.dependencies);
    Object.assign(devDependencies, pkg.devDependencies);
  }
  return { dependencies, devDependencies };
}

export function extensionOf(name: string): string {
  const index = name.lastIndexOf(".");
  return index === -1 ? "" : name.slice(index);
}

export function isTsLikeSource(relative: string): boolean {
  if (relative.endsWith(".d.ts")) return false;
  return TS_LIKE_EXTENSIONS.has(extensionOf(relative));
}

export function isPythonSource(relative: string): boolean {
  return PYTHON_EXTENSIONS.has(extensionOf(relative));
}

export function isPythonManifest(relativePath: string, name: string): boolean {
  if (name === "pyproject.toml" || name === "setup.py" || name === "setup.cfg" || name === "Pipfile") {
    return true;
  }
  return /^requirements(.*)?\.txt$/.test(name) || /(^|\/)requirements\/.+\.txt$/.test(relativePath);
}

export function countLines(text: string): number {
  if (text.length === 0) return 0;
  return text.split(/\r?\n/).length;
}

function parseWorkspaceGlobs(yaml: string): string[] {
  const patterns: string[] = [];
  let inPackages = false;
  for (const line of yaml.split("\n")) {
    if (/^packages:\s*$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (!inPackages) continue;
    const match = line.match(/^\s+-\s+['"]?([^'"#\n]+?)['"]?\s*$/);
    if (match?.[1]) {
      patterns.push(match[1].trim());
      continue;
    }
    if (/^\S/.test(line) && !line.startsWith("#")) break;
  }
  return patterns;
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const record: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") record[key] = item;
  }
  return record;
}

function binEntries(value: unknown): { name: string; path: string }[] {
  if (typeof value === "string") return [{ name: "bin", path: value }];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([name, path]) => ({ name, path }));
}

function addEntrypoint(found: Set<string>, base: string, declared: string): void {
  const path = toPosix(join(base, declared));
  if (/(^|\/)(dist|build|out)(\/|$)/.test(path)) return;
  found.add(path);
}

function exportPaths(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  const paths: string[] = [];
  const values: unknown[] = Object.values(value);
  for (const item of values) {
    if (typeof item === "string") paths.push(item);
    else if (item && typeof item === "object") {
      for (const nested of Object.values(item)) {
        if (typeof nested === "string") paths.push(nested);
      }
    }
  }
  return paths;
}

function isTestPath(relativePath: string): boolean {
  return /(^|\/)(tests?|__tests__|spec|e2e)(\/|$)/.test(relativePath);
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
