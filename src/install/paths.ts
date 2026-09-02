import { join } from "node:path";
import type { ProviderId } from "./providers.js";
export { packageRoot } from "../runtime.js";

export function adapterSkillPath(pkgRoot: string): string {
  return join(pkgRoot, "skills", "coherent", "adapters", "cursor", "skill-template.md");
}

export function sourceSkillDir(pkgRoot: string): string {
  return join(pkgRoot, "skills", "coherent");
}

export function destSkillDir(root: string, provider: ProviderId): string {
  return provider === "codex"
    ? join(root, ".agents", "skills", "coherent")
    : join(root, ".cursor", "skills", "coherent");
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
