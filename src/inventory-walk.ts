import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const SKIP_DIR_NAMES = new Set([
  ".coherent",
  ".backend",
  ".git",
  ".hg",
  ".next",
  ".nuxt",
  ".output",
  ".svelte-kit",
  ".turbo",
  ".cache",
  "coverage",
  "dist",
  "build",
  "out",
  "tmp",
  "node_modules",
  "__pycache__",
  ".venv",
  "venv",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  ".tox",
  ".nox",
  "htmlcov",
]);

export interface WalkedFile {
  relativePath: string;
  absolutePath: string;
  name: string;
}

export function shouldSkipDirectory(name: string): boolean {
  return (
    SKIP_DIR_NAMES.has(name) ||
    name.endsWith(".egg-info") ||
    name === "site-packages" ||
    name.endsWith("venv")
  );
}

export function toPosix(path: string): string {
  return path.split(sep).join("/");
}

export async function walkFiles(
  root: string,
  extraIgnore: Set<string>,
): Promise<WalkedFile[]> {
  const files: WalkedFile[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      throw new Error(`Incomplete inventory: could not read directory ${current}.`, {
        cause: error,
      });
    }

    for (const entry of entries) {
      if (extraIgnore.has(entry.name) || shouldSkipDirectory(entry.name)) {
        continue;
      }
      const absolutePath = join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }
      if (entry.isFile()) {
        files.push({
          absolutePath,
          relativePath: toPosix(relative(root, absolutePath)),
          name: entry.name,
        });
      }
    }
  }

  return files;
}
