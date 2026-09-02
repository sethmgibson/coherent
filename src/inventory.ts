import { readFile } from "node:fs/promises";
import type { CoherentConfig } from "./config.js";
import {
  FRAMEWORKS,
  PERSISTENCE_PACKAGES,
  SOURCE_EXTENSIONS,
  countLines,
  detectEntrypoints,
  detectLanguages,
  detectPackageManager,
  detectSourceDirectories,
  detectTestDirectories,
  detectTopLevelModules,
  detectWorkspace,
  extensionOf,
  isPythonSource,
  mergeDependencies,
  readPackages,
} from "./inventory-scan.js";
import {
  hasPythonMainGuard,
  isPythonTestFile,
  pythonFrameworks,
  pythonManifestPaths,
  pythonPersistence,
  pythonScriptEntrypoints,
  readPythonDependencySignals,
} from "./inventory-python.js";
import { walkFiles } from "./inventory-walk.js";

export type PackageManager = "pnpm" | "npm" | "yarn" | "bun" | "unknown";

export interface PackageInfo {
  path: string;
  name: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  bins: { name: string; path: string }[];
  main?: string;
  exports?: string[];
}

export interface Inventory {
  root: string;
  packageManager: PackageManager;
  languages: string[];
  packageJsonFiles: string[];
  pythonManifests: string[];
  workspace: { kind: string; patterns: string[]; packages: string[] } | null;
  tsconfigFiles: string[];
  sourceDirectories: string[];
  testDirectories: string[];
  entrypoints: string[];
  topLevelModules: string[];
  packages: PackageInfo[];
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  fileCount: number;
  lineCount: number;
  frameworks: string[];
  persistenceLibraries: string[];
}

export async function collectInventory(
  root: string,
  config: CoherentConfig = {},
): Promise<Inventory> {
  const files = await walkFiles(root, new Set(config.ignore ?? []));
  const packageJsonFiles = files
    .filter((file) => file.name === "package.json")
    .map((file) => file.relativePath)
    .sort();
  const tsconfigFiles = files
    .filter((file) => /^tsconfig(\..+)?\.json$/.test(file.name))
    .map((file) => file.relativePath)
    .sort();

  const packages = await readPackages(root, packageJsonFiles);
  const pythonManifests = pythonManifestPaths(files);
  const knownPython = new Set(
    files.filter((file) => isPythonSource(file.relativePath)).map((file) => file.relativePath),
  );
  const [pythonDependencies, scriptEntrypoints] = await Promise.all([
    readPythonDependencySignals(root, pythonManifests),
    pythonScriptEntrypoints(root, pythonManifests, knownPython),
  ]);
  const sourceDirectories = detectSourceDirectories(files);
  const { dependencies, devDependencies } = mergeDependencies(packages);
  const allDeps = { ...dependencies, ...devDependencies, ...pythonDependencies };

  let lineCount = 0;
  const mainGuardEntrypoints: string[] = [];
  for (const file of files) {
    if (!SOURCE_EXTENSIONS.has(extensionOf(file.name))) continue;
    const text = await readFile(file.absolutePath, "utf8");
    lineCount += countLines(text);
    if (
      isPythonSource(file.relativePath) &&
      !isPythonTestFile(file.relativePath) &&
      hasPythonMainGuard(text)
    ) {
      mainGuardEntrypoints.push(file.relativePath);
    }
  }

  return {
    root,
    packageManager: detectPackageManager(files),
    languages: detectLanguages(files),
    packageJsonFiles,
    pythonManifests,
    workspace: await detectWorkspace(root, packages),
    tsconfigFiles,
    sourceDirectories,
    testDirectories: detectTestDirectories(files),
    entrypoints: uniqueSorted([
      ...detectEntrypoints(packages, files),
      ...scriptEntrypoints,
      ...mainGuardEntrypoints,
    ]),
    topLevelModules: detectTopLevelModules(files, sourceDirectories),
    packages,
    dependencies,
    devDependencies,
    fileCount: files.length,
    lineCount,
    frameworks: uniqueSorted([
      ...FRAMEWORKS.filter((framework) =>
        framework.packages.some((pkg) => pkg in allDeps),
      ).map((framework) => framework.name),
      ...pythonFrameworks(pythonDependencies),
    ]),
    persistenceLibraries: uniqueSorted([
      ...PERSISTENCE_PACKAGES.filter((pkg) => pkg in allDeps),
      ...pythonPersistence(pythonDependencies),
    ]),
  };
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}
