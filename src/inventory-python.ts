import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { FRAMEWORKS, PERSISTENCE_PACKAGES, isPythonManifest } from "./inventory-scan.js";
import type { WalkedFile } from "./inventory-walk.js";

const PYTHON_SIGNAL_PACKAGES = new Set([
  ...FRAMEWORKS.flatMap((framework) => framework.packages),
  ...PERSISTENCE_PACKAGES,
]);

export function pythonManifestPaths(files: WalkedFile[]): string[] {
  return files
    .filter((file) => isPythonManifest(file.relativePath, file.name))
    .map((file) => file.relativePath)
    .sort();
}

export async function readPythonDependencySignals(
  root: string,
  manifests: string[],
): Promise<Record<string, string>> {
  const dependencies: Record<string, string> = {};
  for (const relativePath of manifests) {
    let text: string;
    try {
      text = await readFile(join(root, relativePath), "utf8");
    } catch (error) {
      throw new Error(`Incomplete inventory: could not read Python manifest ${relativePath}.`, {
        cause: error,
      });
    }
    for (const [name, version] of extractPythonPackages(text, relativePath)) {
      if (name in dependencies) continue;
      dependencies[name] = version;
    }
  }
  return dependencies;
}

export function pythonFrameworks(dependencies: Record<string, string>): string[] {
  return FRAMEWORKS.filter((framework) =>
    framework.packages.some((pkg) => pkg in dependencies),
  ).map((framework) => framework.name);
}

export function pythonPersistence(dependencies: Record<string, string>): string[] {
  return PERSISTENCE_PACKAGES.filter((pkg) => pkg in dependencies);
}

function extractPythonPackages(text: string, relativePath: string): Array<[string, string]> {
  const found: Array<[string, string]> = [];
  if (relativePath.endsWith(".toml") || relativePath.endsWith(".cfg")) {
    found.push(...fromQuotedDependencies(text));
    found.push(...fromAssignmentDependencies(text));
  } else if (relativePath.endsWith(".py")) {
    found.push(...fromQuotedDependencies(text));
  } else {
    found.push(...fromRequirementLines(text));
  }
  return found.filter(([name]) => PYTHON_SIGNAL_PACKAGES.has(name));
}

function fromQuotedDependencies(text: string): Array<[string, string]> {
  const found: Array<[string, string]> = [];
  const quoted = /["']([A-Za-z0-9_.-]+)(\[[^\]]+\])?([><=!~][^"',\]]+)?["']/g;
  for (const match of text.matchAll(quoted)) {
    const name = normalizePackageName(match[1] ?? "");
    if (!name || name === "python") continue;
    found.push([name, (match[3] ?? "*").trim() || "*"]);
  }
  return found;
}

function fromAssignmentDependencies(text: string): Array<[string, string]> {
  const found: Array<[string, string]> = [];
  for (const line of text.split("\n")) {
    const match = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*["']([^"']+)["']/);
    if (!match?.[1] || match[1] === "python") continue;
    found.push([normalizePackageName(match[1]), match[2] ?? "*"]);
  }
  return found;
}

function fromRequirementLines(text: string): Array<[string, string]> {
  const found: Array<[string, string]> = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("-")) continue;
    const match = line.match(/^([A-Za-z0-9_.-]+)(\[[^\]]+\])?\s*([><=!~].+)?$/);
    if (!match?.[1]) continue;
    found.push([normalizePackageName(match[1]), (match[3] ?? "*").trim() || "*"]);
  }
  return found;
}

function normalizePackageName(name: string): string {
  return name.trim().toLowerCase().replace(/_/g, "-");
}
