import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  renderCleanupPhasesMarkdown,
  renderTaxonomyMarkdown,
} from "../src/catalog/render-docs.js";
import { RULES } from "../src/catalog/rules.js";

const reference = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "skills",
  "coherent",
  "reference",
);
const repoRoot = join(reference, "..", "..", "..");

describe("generated skill docs", () => {
  it("keeps taxonomy.md in sync with the catalog", async () => {
    const onDisk = await readFile(join(reference, "taxonomy.md"), "utf8");
    expect(onDisk).toBe(renderTaxonomyMarkdown());
    for (const rule of RULES) {
      expect(onDisk).toContain(rule.id);
      expect(onDisk).toContain(rule.slug);
    }
  });

  it("keeps cleanup-phases.md in sync with the phase model", async () => {
    const onDisk = await readFile(join(reference, "cleanup-phases.md"), "utf8");
    expect(onDisk).toBe(renderCleanupPhasesMarkdown());
    expect(onDisk).toContain("A08 → A07 → A08");
    expect(onDisk).toContain("cleanup DAG is authoritative");
  });

  it("ships the provider-neutral reference set", async () => {
    const files = [
      "semantic-audits.md",
      "architecture-analysis.md",
      "cleanup-planning.md",
      "fix-safety.md",
      "prevention.md",
      "plan.md",
      "fix.md",
      "install.md",
      "full-cleanup.md",
      "inspect.md",
    ];
    for (const file of files) {
      const text = await readFile(join(reference, file), "utf8");
      expect(text.length).toBeGreaterThan(40);
    }
  });

  it("keeps Codex and Cursor adapters pointed at the canonical skill", async () => {
    const canonical = await readFile(join(repoRoot, "skills", "coherent", "SKILL.md"), "utf8");
    expect(canonical).toMatch(/^---\nname: coherent\n/);

    const codex = await readFile(
      join(repoRoot, ".agents", "skills", "coherent", "SKILL.md"),
      "utf8",
    );
    expect(codex).toMatch(/^---\nname: coherent\n/);
    expect(codex).toContain("../../../skills/coherent/SKILL.md");

    const cursor = await readFile(
      join(repoRoot, ".cursor", "skills", "coherent", "SKILL.md"),
      "utf8",
    );
    expect(cursor).toMatch(/^---\nname: coherent\n/);
    expect(cursor).toContain("skills/coherent/SKILL.md");
  });

  it("does not package nested discoverable skills", async () => {
    const skillRoot = join(repoRoot, "skills", "coherent");
    const nested = await nestedSkillFiles(skillRoot);
    expect(nested).toEqual([]);
    const template = await readFile(
      join(skillRoot, "adapters", "cursor", "skill-template.md"),
      "utf8",
    );
    expect(template).toMatch(/^---\nname: coherent\n/);
  });
});

async function nestedSkillFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (entry.name === "SKILL.md" && current !== root) found.push(path);
    }
  }
  return found.sort();
}
