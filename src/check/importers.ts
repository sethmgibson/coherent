import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { ts } from "ts-morph";
import { createModuleResolver } from "../analysis/context.js";
import type { CoherentConfig } from "../config.js";
import { collectInventory } from "../inventory.js";
import { extensionOf } from "../inventory-scan.js";
import { toPosix, walkFiles } from "../inventory-walk.js";

const TS_LIKE = new Set([".ts", ".tsx", ".mts", ".cts"]);

/** Include transitive importers so every scoped export retains its callers. */
export async function expandWithImporters(
  root: string,
  changed: string[],
  config: CoherentConfig = {},
): Promise<string[]> {
  const changedSet = new Set(changed.map((path) => toPosix(path)));
  if (changedSet.size === 0) return [];
  const [walked, inventory] = await Promise.all([
    walkFiles(root, new Set(config.ignore ?? [])),
    collectInventory(root, config),
  ]);
  const resolver = createModuleResolver(root, inventory);
  const sources = walked.filter((file) =>
    TS_LIKE.has(extensionOf(file.name)) && !file.name.endsWith(".d.ts"),
  );
  const sourcePaths = new Set(sources.map((file) => file.relativePath));
  const byTarget = new Map<string, Set<string>>();
  for (const file of sources) {
    const text = await readFile(file.absolutePath, "utf8");
    for (const spec of ts.preProcessFile(text, true, true).importedFiles) {
      const target = resolver.resolve(spec.fileName, file.absolutePath);
      if (!target) continue;
      const targetPath = toPosix(relative(root, target.resolvedFileName));
      if (!sourcePaths.has(targetPath)) continue;
      const callers = byTarget.get(targetPath) ?? new Set<string>();
      callers.add(file.relativePath);
      byTarget.set(targetPath, callers);
    }
  }
  const importers = new Set([...changedSet].filter((path) => sourcePaths.has(path)));
  const pending = [...importers];
  for (let index = 0; index < pending.length; index += 1) {
    for (const caller of byTarget.get(pending[index]!) ?? []) {
      if (importers.has(caller)) continue;
      importers.add(caller);
      pending.push(caller);
    }
  }
  return [...importers].sort();
}
