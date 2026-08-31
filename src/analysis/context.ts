import { basename, dirname, join, relative, resolve, sep } from "node:path";
import {
  Project,
  ScriptTarget,
  ModuleKind,
  ModuleResolutionKind,
  ts,
  type ResolutionHostFactory,
} from "ts-morph";
import type { SourceFile } from "ts-morph";
import type { CoherentConfig } from "../config.js";
import { SOURCE_EXTENSIONS, extensionOf } from "../inventory-scan.js";
import { walkFiles, toPosix, type WalkedFile } from "../inventory-walk.js";
import type { Inventory } from "../inventory.js";

const TS_LIKE = new Set([".ts", ".tsx", ".mts", ".cts"]);

export interface AnalysisContext {
  root: string;
  inventory: Inventory;
  project: Project;
  sourceFiles: SourceFile[];
  publicModules: Set<string>;
  relativePath(file: SourceFile | string): string;
  isTestFile(relativePath: string): boolean;
  isPublicModule(relativePath: string): boolean;
}

export interface AnalysisScope {
  /** Parse only these repo-relative paths. Full-repo walk when omitted. */
  include?: string[];
}

export async function createAnalysisContext(
  root: string,
  inventory: Inventory,
  config: CoherentConfig = {},
  scope: AnalysisScope = {},
): Promise<AnalysisContext> {
  const tsConfigs = loadTsConfigs(root, inventory);
  const compilerOptions =
    tsConfigs.find((config) => config.path === join(root, "tsconfig.json"))?.options ??
    tsConfigs[0]?.options ?? {
      target: ScriptTarget.ES2022,
      module: ModuleKind.Node16,
      moduleResolution: ModuleResolutionKind.Node16,
      strict: true,
      skipLibCheck: true,
      allowJs: false,
      experimentalDecorators: true,
      noEmit: true,
    };
  const project = new Project({
    compilerOptions,
    resolutionHost: createResolutionHost(tsConfigs),
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: false,
  });

  const include = scope.include
    ? new Set(scope.include.map((path) => toPosix(path)))
    : undefined;
  const walked = include
    ? includePaths(root, include)
    : await walkFiles(root, new Set(config.ignore ?? []));
  const sourceFiles: SourceFile[] = [];
  for (const file of walked) {
    const ext = extensionOf(file.name);
    if (!TS_LIKE.has(ext) || file.name.endsWith(".d.ts")) continue;
    if (!SOURCE_EXTENSIONS.has(ext)) continue;
    try {
      sourceFiles.push(project.addSourceFileAtPath(file.absolutePath));
    } catch (error) {
      throw new Error(
        `Incomplete analysis: failed to load source file ${file.relativePath}: ${errorMessage(error)}`,
      );
    }
  }

  const publicModules = discoverPublicModules(inventory, sourceFiles, root);

  return {
    root,
    inventory,
    project,
    sourceFiles,
    publicModules,
    relativePath(file) {
      const abs = typeof file === "string" ? file : file.getFilePath();
      return toPosix(relative(root, abs));
    },
    isTestFile(relativePath) {
      return (
        /(^|\/)(tests?|__tests__|spec|e2e)(\/|$)/.test(relativePath) ||
        /\.(spec|test)\.[cm]?[jt]sx?$/.test(relativePath)
      );
    },
    isPublicModule(relativePath) {
      return publicModules.has(relativePath);
    },
  };
}

interface LoadedTsConfig {
  path: string;
  directory: string;
  options: ts.CompilerOptions;
  files: Set<string>;
}

function loadTsConfigs(root: string, inventory: Inventory): LoadedTsConfig[] {
  const configs: LoadedTsConfig[] = [];
  for (const relativePath of inventory.tsconfigFiles) {
    const path = join(root, relativePath);
    const read = ts.readConfigFile(path, ts.sys.readFile);
    if (read.error) {
      throw new Error(
        `Incomplete analysis: failed to read TypeScript config ${relativePath}: ${diagnosticMessage(read.error)}`,
      );
    }
    const parsed = ts.parseJsonConfigFileContent(
      read.config,
      ts.sys,
      dirname(path),
      undefined,
      path,
    );
    if (parsed.errors.length > 0) {
      throw new Error(
        `Incomplete analysis: failed to parse TypeScript config ${relativePath}: ${parsed.errors.map(diagnosticMessage).join("; ")}`,
      );
    }
    configs.push({
      path,
      directory: dirname(path),
      options: parsed.options,
      files: new Set(parsed.fileNames.map((file) => resolve(file))),
    });
  }
  return configs.sort(compareTsConfigs);
}

function diagnosticMessage(diagnostic: ts.Diagnostic): string {
  return `TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function compareTsConfigs(left: LoadedTsConfig, right: LoadedTsConfig): number {
  const directoryDepth = right.directory.length - left.directory.length;
  if (directoryDepth !== 0) return directoryDepth;
  const leftPrimary = basename(left.path) === "tsconfig.json" ? 0 : 1;
  const rightPrimary = basename(right.path) === "tsconfig.json" ? 0 : 1;
  if (leftPrimary !== rightPrimary) return leftPrimary - rightPrimary;
  return left.path.localeCompare(right.path);
}

function createResolutionHost(configs: LoadedTsConfig[]): ResolutionHostFactory {
  return (host, getCompilerOptions) => ({
    resolveModuleNames(moduleNames, containingFile) {
      const options = optionsForFile(containingFile, configs) ?? getCompilerOptions();
      return moduleNames.map(
        (moduleName) =>
          ts.resolveModuleName(moduleName, containingFile, options, host).resolvedModule,
      );
    },
  });
}

function optionsForFile(
  containingFile: string,
  configs: LoadedTsConfig[],
): ts.CompilerOptions | undefined {
  const absolute = resolve(containingFile);
  const direct = configs.find((config) => config.files.has(absolute));
  if (direct) return direct.options;
  return configs.find(
    (config) =>
      absolute === config.directory || absolute.startsWith(`${config.directory}${sep}`),
  )?.options;
}

function includePaths(root: string, include: Set<string>): WalkedFile[] {
  const files: WalkedFile[] = [];
  for (const relativePath of include) {
    const posix = toPosix(relativePath);
    files.push({
      relativePath: posix,
      absolutePath: join(root, posix),
      name: posix.slice(posix.lastIndexOf("/") + 1) || posix,
    });
  }
  return files;
}

function discoverPublicModules(
  inventory: Inventory,
  sourceFiles: SourceFile[],
  root: string,
): Set<string> {
  const declared = new Set<string>();
  for (const pkg of inventory.packages) {
    const base = pkg.path === "package.json" ? "" : pkg.path.replace(/\/package\.json$/, "");
    const prefix = base ? `${base}/` : "";
    if (pkg.main) addDeclared(declared, `${prefix}${pkg.main}`);
    for (const exported of pkg.exports ?? []) {
      addDeclared(declared, `${prefix}${exported}`);
    }
    for (const bin of pkg.bins) {
      addDeclared(declared, `${prefix}${bin.path}`);
    }
  }
  for (const entry of inventory.entrypoints) {
    addDeclared(declared, entry);
  }

  const existing = new Set(
    sourceFiles.map((file) => toPosix(relative(root, file.getFilePath()))),
  );
  const resolved = new Set<string>();
  for (const path of declared) {
    for (const candidate of sourceCandidates(path)) {
      if (existing.has(candidate)) resolved.add(candidate);
    }
  }
  return resolved;
}

function addDeclared(target: Set<string>, declared: string): void {
  const normalized = toPosix(declared.replace(/^\.\//, ""));
  if (/(^|\/)(dist|build|out)(\/|$)/.test(normalized)) {
    target.add(normalized.replace(/^(dist|build|out)\//, "src/"));
  }
  target.add(normalized);
}

function sourceCandidates(path: string): string[] {
  const withoutJs = path.replace(/\.(m|c)?js$/, (match) => {
    if (match === ".mjs") return ".mts";
    if (match === ".cjs") return ".cts";
    return ".ts";
  });
  return [...new Set([path, withoutJs])];
}
