import { relative } from "node:path";
import { Project, ScriptTarget, ModuleKind, ModuleResolutionKind } from "ts-morph";
import type { SourceFile } from "ts-morph";
import type { CoherentConfig } from "../config.js";
import { SOURCE_EXTENSIONS, extensionOf } from "../inventory-scan.js";
import { walkFiles, toPosix } from "../inventory-walk.js";
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

export async function createAnalysisContext(
  root: string,
  inventory: Inventory,
  config: CoherentConfig = {},
): Promise<AnalysisContext> {
  const project = new Project({
    compilerOptions: {
      target: ScriptTarget.ES2022,
      module: ModuleKind.Node16,
      moduleResolution: ModuleResolutionKind.Node16,
      strict: true,
      skipLibCheck: true,
      allowJs: false,
      experimentalDecorators: true,
      noEmit: true,
    },
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });

  const walked = await walkFiles(root, new Set(config.ignore ?? []));
  const sourceFiles: SourceFile[] = [];
  for (const file of walked) {
    const ext = extensionOf(file.name);
    if (!TS_LIKE.has(ext) || file.name.endsWith(".d.ts")) continue;
    if (!SOURCE_EXTENSIONS.has(ext)) continue;
    sourceFiles.push(project.addSourceFileAtPath(file.absolutePath));
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
      return /(^|\/)(tests?|__tests__|spec|e2e)(\/|$)/.test(relativePath);
    },
    isPublicModule(relativePath) {
      return publicModules.has(relativePath);
    },
  };
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
