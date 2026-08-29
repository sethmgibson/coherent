import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { toPosix } from "../inventory-walk.js";
import {
  BACKEND_ALIAS_SKILL,
  writeManagedFile,
  type CopyResult,
} from "./copy.js";
import { writePreventionHooks } from "./hooks.js";
import {
  adapterSkillPath,
  destAdapter,
  destAlias,
  destPrevention,
  packageRoot,
  preventionTemplatePath,
} from "./paths.js";

export interface InstallOptions {
  rule?: boolean;
  hooks?: boolean;
}

export interface InstallResult {
  root: string;
  actions: CopyResult[];
}

export async function runInstall(
  root: string,
  options: InstallOptions = {},
): Promise<InstallResult> {
  const pkg = packageRoot();
  const adapter = await readFile(adapterSkillPath(pkg), "utf8");
  const actions: CopyResult[] = [
    rel(root, await writeManagedFile(destAdapter(root), adapter, "adapter")),
    rel(root, await writeManagedFile(destAlias(root), BACKEND_ALIAS_SKILL, "adapter")),
  ];
  if (options.rule !== false) {
    const prevention = await readFile(preventionTemplatePath(pkg), "utf8");
    actions.push(
      rel(root, await writeManagedFile(destPrevention(root), prevention, "prevention")),
    );
  }
  if (options.hooks !== false) {
    for (const action of await writePreventionHooks(root)) {
      actions.push(rel(root, action));
    }
  }
  return { root, actions };
}

export const runUpdate = runInstall;

export function renderInstall(title: string, result: InstallResult): string {
  const lines = [title];
  for (const action of result.actions) {
    const extra = action.reason ? ` (${action.reason})` : "";
    lines.push(`  ${action.action} ${action.path}${extra}`);
  }
  return `${lines.join("\n")}\n`;
}

function rel(root: string, result: CopyResult): CopyResult {
  return { ...result, path: toPosix(relative(root, result.path)) || result.path };
}
