import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type { CopyResult } from "./copy.js";
import { looksLikeAdapterSkill } from "./copy.js";

export async function copySkillTree(sourceDir: string, destDir: string): Promise<CopyResult[]> {
  const existingSkill = await readIfExists(join(destDir, "SKILL.md"));
  if (existingSkill !== undefined && looksLikeAdapterSkill(existingSkill)) {
    return [{ path: join(destDir, "SKILL.md"), action: "skipped", reason: "existing adapter" }];
  }
  const actions: CopyResult[] = [];
  for (const source of await listFiles(sourceDir)) {
    const rel = relative(sourceDir, source);
    const dest = join(destDir, rel);
    const shipped = await readFile(source, "utf8");
    actions.push(await writeShippedFile(dest, shipped, kindFor(rel)));
  }
  return actions;
}

export type ShippedKind = "skill" | "reference" | "other";

export async function writeShippedFile(
  dest: string,
  shipped: string,
  kind: ShippedKind,
): Promise<CopyResult> {
  const existing = await readIfExists(dest);
  if (existing === undefined) {
    await writeText(dest, shipped);
    return { path: dest, action: "wrote" };
  }
  if (existing === shipped || existing === `${shipped}\n` || `${existing}\n` === shipped) {
    return { path: dest, action: "unchanged" };
  }
  if (kind === "reference") {
    await writeText(dest, shipped);
    return { path: dest, action: "updated" };
  }
  if (kind === "skill" && looksLikeStubSkill(existing)) {
    await writeText(dest, shipped);
    return { path: dest, action: "updated" };
  }
  return { path: dest, action: "skipped", reason: "user edits" };
}

function kindFor(relativePath: string): ShippedKind {
  const posix = relativePath.replaceAll("\\", "/");
  if (posix === "SKILL.md") return "skill";
  if (posix.startsWith("reference/")) return "reference";
  return "other";
}

function looksLikeStubSkill(existing: string): boolean {
  if (existing.split("\n").length > 40) return false;
  return (
    existing.includes("skills/coherent/SKILL.md") &&
    (existing.includes("This is a Cursor adapter") ||
      existing.includes("Alias for /coherent") ||
      existing.includes("skill alias for Coherent"))
  );
}

async function listFiles(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await listFiles(path));
    else if (entry.isFile()) found.push(path);
  }
  return found.sort();
}

async function readIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return undefined;
  }
}

async function writeText(dest: string, contents: string): Promise<void> {
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, contents.endsWith("\n") ? contents : `${contents}\n`, "utf8");
}
