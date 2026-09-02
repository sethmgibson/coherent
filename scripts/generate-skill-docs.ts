import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderCleanupPhasesMarkdown,
  renderTaxonomyMarkdown,
} from "../src/catalog/render-docs.ts";
import { renderRuntimeRequirementMarkdown } from "../src/runtime.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const referenceDir = join(root, "skills", "coherent", "reference");
const check = process.argv.includes("--check");

const files = [
  { name: "taxonomy.md", text: renderTaxonomyMarkdown() },
  { name: "cleanup-phases.md", text: renderCleanupPhasesMarkdown() },
  { name: "runtime.md", text: renderRuntimeRequirementMarkdown() },
] as const;

await mkdir(referenceDir, { recursive: true });
const drifted: string[] = [];
for (const file of files) {
  const path = join(referenceDir, file.name);
  const current = await readFile(path, "utf8").catch(() => "");
  if (current !== file.text) {
    drifted.push(file.name);
    await writeFile(path, file.text, "utf8");
  }
  console.log(`${current === file.text ? "Checked" : "Wrote"} skills/coherent/reference/${file.name}`);
}

if (check && drifted.length > 0) {
  throw new Error(
    `Generated skill docs drifted: ${drifted.join(", ")}. Commit the written files.`,
  );
}
