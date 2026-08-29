import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function packageRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, "skills", "coherent", "SKILL.md"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not find the Coherent package (skills/coherent is missing).");
}

export function adapterSkillPath(pkgRoot: string): string {
  return join(pkgRoot, "skills", "coherent", "adapters", "cursor", "skill-template.md");
}

export function preventionTemplatePath(pkgRoot: string): string {
  return join(pkgRoot, "skills", "coherent", "adapters", "cursor", "prevention.mdc");
}

export function destAdapter(root: string): string {
  return join(root, ".cursor", "skills", "coherent", "SKILL.md");
}

export function destAlias(root: string): string {
  return join(root, ".cursor", "skills", "backend", "SKILL.md");
}

export function destPrevention(root: string): string {
  return join(root, ".cursor", "rules", "backend-prevention.mdc");
}

export function destHooksJson(root: string): string {
  return join(root, ".cursor", "hooks.json");
}

export function destHookScript(root: string): string {
  return join(root, ".cursor", "hooks", "coherent-check.sh");
}

export function destGitHook(root: string): string {
  return join(root, ".git", "hooks", "pre-commit");
}
