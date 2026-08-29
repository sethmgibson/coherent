import { readFile } from "node:fs/promises";
import { posix } from "node:path";
import type { CoherentConfig } from "../config.js";
import { SOURCE_EXTENSIONS, extensionOf } from "../inventory-scan.js";
import { toPosix, walkFiles } from "../inventory-walk.js";

const TS_LIKE = new Set([".ts", ".tsx", ".mts", ".cts"]);
const IMPORT_SPEC = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;

/** Add files that import a changed module so A08 can see remaining callers. */
export async function expandWithImporters(
  root: string,
  changed: string[],
  config: CoherentConfig = {},
): Promise<string[]> {
  const changedSet = new Set(changed.map((path) => toPosix(path)));
  if (changedSet.size === 0) return [];
  const walked = await walkFiles(root, new Set(config.ignore ?? []));
  const importers = new Set<string>(changedSet);
  for (const file of walked) {
    const relative = toPosix(file.relativePath);
    if (changedSet.has(relative)) continue;
    if (!TS_LIKE.has(extensionOf(file.name)) || file.name.endsWith(".d.ts")) continue;
    if (!SOURCE_EXTENSIONS.has(extensionOf(file.name))) continue;
    const text = await readFile(file.absolutePath, "utf8");
    for (const spec of importSpecifiers(text)) {
      if (resolvesToChanged(relative, spec, changedSet)) {
        importers.add(relative);
        break;
      }
    }
  }
  return [...importers];
}

function importSpecifiers(text: string): string[] {
  const specs: string[] = [];
  IMPORT_SPEC.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IMPORT_SPEC.exec(text))) {
    if (match[1]) specs.push(match[1]);
  }
  return specs;
}

function resolvesToChanged(fromFile: string, spec: string, changed: Set<string>): boolean {
  if (!spec.startsWith(".")) return false;
  for (const candidate of relativeCandidates(fromFile, spec)) {
    if (changed.has(candidate)) return true;
  }
  return false;
}

function relativeCandidates(fromFile: string, spec: string): string[] {
  const raw = posix.normalize(posix.join(posix.dirname(fromFile), spec));
  const withoutJs = raw.replace(/\.(m|c)?js$/, (match) => {
    if (match === ".mjs") return ".mts";
    if (match === ".cjs") return ".cts";
    return ".ts";
  });
  const candidates = [raw, withoutJs];
  for (const ext of [".ts", ".tsx", ".mts", ".cts"]) {
    candidates.push(`${raw}${ext}`);
    candidates.push(posix.join(raw, `index${ext}`));
  }
  return [...new Set(candidates.map((path) => toPosix(path)))];
}
