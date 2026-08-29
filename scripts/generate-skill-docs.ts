import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderCleanupPhasesMarkdown,
  renderTaxonomyMarkdown,
} from "../src/catalog/render-docs.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const referenceDir = join(root, "skills", "coherent", "reference");

await mkdir(referenceDir, { recursive: true });
await writeFile(join(referenceDir, "taxonomy.md"), renderTaxonomyMarkdown(), "utf8");
await writeFile(
  join(referenceDir, "cleanup-phases.md"),
  renderCleanupPhasesMarkdown(),
  "utf8",
);
console.log("Wrote skills/coherent/reference/taxonomy.md");
console.log("Wrote skills/coherent/reference/cleanup-phases.md");
