import { homedir } from "node:os";
import { relative } from "node:path";
import { readFile } from "node:fs/promises";
import { toPosix } from "../inventory-walk.js";
import {
  BACKEND_ALIAS_SKILL,
  writeManagedFile,
  type CopyResult,
} from "./copy.js";
import {
  detectRootPackageManager,
  installProjectCli,
  skillsOnlyCliResult,
  verifyProjectCliHandshake,
  type CliDependencyResult,
} from "./cli-dep.js";
import type { RunCommandFn } from "./exec.js";
import {
  collectInstallDetections,
  defaultDetectedProviders,
  formatInstallDetectionLines,
  formatPathForDisplay,
  providersOrDefault,
  type HarnessDetection,
} from "./detect.js";
import { writeCursorPreventionHook, writeGitPreventionHook } from "./hooks.js";
import {
  adapterSkillPath,
  destAdapter,
  destAlias,
  destPrevention,
  destSkillDir,
  packageRoot,
  preventionTemplatePath,
  sourceSkillDir,
} from "./paths.js";
import { promptProviders, promptScope, type AskFn } from "./prompt.js";
import {
  parseInstallScope,
  parseProvidersOption,
  type InstallScope,
  type ProviderId,
} from "./providers.js";
import { PUBLIC_NPX_INSTALL, PUBLIC_NPM_EXEC_INSTALL } from "./spec.js";
import { copySkillTree } from "./skill-tree.js";

export interface InstallOptions {
  adapter?: boolean;
  alias?: boolean;
  rule?: boolean;
  cursorHook?: boolean;
  gitHook?: boolean;
  providers?: string;
  scope?: string;
  yes?: boolean;
  skillsOnly?: boolean;
  home?: string;
  pathEnv?: string;
  interactive?: boolean;
  ask?: AskFn;
  runCommand?: RunCommandFn;
  installCli?: boolean;
}

export interface InstallResult {
  root: string;
  home: string;
  actions: CopyResult[];
  detections: HarnessDetection[];
  adoption?: {
    providers: ProviderId[];
    scope: InstallScope;
    installRoot: string;
  };
  cli?: CliDependencyResult;
}

export async function runInstall(
  root: string,
  options: InstallOptions = {},
): Promise<InstallResult> {
  const home = options.home ?? homedir();
  const detections = collectInstallDetections(root, home, options.pathEnv ?? process.env.PATH ?? "");
  const actions: CopyResult[] = [];
  const adoption = await chooseAdoption(root, home, detections, options);
  if (options.adapter === true && !writesProjectCursorTree(adoption)) {
    const adapter = await readFile(adapterSkillPath(packageRoot()), "utf8");
    actions.push(rel(root, await writeManagedFile(destAdapter(root), adapter, "adapter")));
  }
  if (options.alias === true) {
    actions.push(rel(root, await writeManagedFile(destAlias(root), BACKEND_ALIAS_SKILL, "adapter")));
  }
  if (options.rule === true) {
    const prevention = await readFile(preventionTemplatePath(packageRoot()), "utf8");
    actions.push(rel(root, await writeManagedFile(destPrevention(root), prevention, "prevention")));
  }
  if (options.cursorHook === true) {
    for (const action of await writeCursorPreventionHook(root)) {
      actions.push(rel(root, action));
    }
  }
  if (options.gitHook === true) {
    actions.push(rel(root, await writeGitPreventionHook(root)));
  }

  let cli: CliDependencyResult | undefined;
  if (adoption?.scope === "project") {
    if (shouldInstallProjectCli(options)) {
      cli = await installProjectCli(root, projectCliOptions(options));
      await verifyProjectCliHandshake(root, projectCliOptions(options));
      cli = { ...cli, handshakeVerified: true };
    } else if (options.skillsOnly === true) {
      cli = skillsOnlyCliResult(root, await detectRootPackageManager(root));
    }
  }
  if (adoption) {
    const pkg = packageRoot();
    for (const provider of adoption.providers) {
      for (const action of await copySkillTree(sourceSkillDir(pkg), destSkillDir(adoption.installRoot, provider))) {
        actions.push(rel(adoption.installRoot, action));
      }
    }
    if (cli && !cli.skillsOnly) {
      actions.push(rel(root, cli.action));
    }
  }
  return {
    root,
    home,
    actions,
    detections,
    ...(adoption ? { adoption } : {}),
    ...(cli ? { cli } : {}),
  };
}

export async function runUpdate(
  root: string,
  options: InstallOptions = {},
): Promise<InstallResult> {
  return runInstall(root, { ...options, installCli: false });
}

export function renderInstall(title: string, result: InstallResult): string {
  const lines = [title];
  if (title === "Coherent update") {
    lines.push("  integration refresh only; this does not update the Coherent CLI package");
  }
  if (result.adoption === undefined && result.actions.length === 0) {
    lines.push("  no integrations selected; use an explicit install flag");
    lines.push(`  or ${PUBLIC_NPX_INSTALL} --yes`);
  }
  if (result.detections.length > 0 && result.adoption !== undefined) {
    for (const line of formatInstallDetectionLines(result.root, result.detections, result.home)) {
      lines.push(`  ${line}`);
    }
  }
  for (const action of result.actions) {
    const extra = action.reason ? ` (${action.reason})` : "";
    lines.push(`  ${action.action} ${action.path}${extra}`);
  }
  if (result.adoption?.scope === "project" && result.cli) {
    if (result.cli.skillsOnly) {
      lines.push("  skills only; the project CLI was not installed");
      lines.push(`  add it later with: ${result.cli.addCommand}`);
    } else {
      const verb = result.cli.alreadyPresent ? "ensured" : "installed";
      lines.push(`  ${verb} github:sethmgibson/coherent with ${result.cli.resolvedManager}`);
      if (result.cli.handshakeVerified) {
        lines.push("  verified project-local CLI handshake");
      }
    }
  }
  if (result.adoption?.scope === "global") {
    lines.push("  global skill files do not install the Coherent CLI or put it on PATH");
    lines.push("  add github:sethmgibson/coherent to each project, or run commands through");
    lines.push(`  ${PUBLIC_NPM_EXEC_INSTALL.replace(/ install$/, " <command>")}`);
  }
  if (result.adoption !== undefined || result.actions.some((action) => action.action === "wrote" || action.action === "updated")) {
    lines.push("  reload Codex or Cursor so it discovers the skill, then run $coherent init or /coherent init");
  }
  return `${lines.join("\n")}\n`;
}

async function chooseAdoption(
  root: string,
  home: string,
  detections: HarnessDetection[],
  options: InstallOptions,
): Promise<{ providers: ProviderId[]; scope: InstallScope; installRoot: string } | undefined> {
  const explicitProviders = typeof options.providers === "string";
  const explicitScope = typeof options.scope === "string";
  const flagged = options.yes === true || explicitProviders || explicitScope;
  const interactive = options.interactive === true;
  if (!flagged && hasExplicitIntegrations(options)) return undefined;
  if (!flagged && !interactive) return undefined;

  let providers: ProviderId[];
  if (explicitProviders) {
    providers = parseProvidersOption(options.providers ?? "");
  } else if (options.yes === true || !interactive) {
    providers = providersOrDefault(defaultDetectedProviders(detections));
  } else {
    stdoutDetections(root, detections, home);
    providers = await promptProviders(defaultDetectedProviders(detections), options.ask);
  }

  let scope: InstallScope;
  if (explicitScope) {
    scope = parseInstallScope(options.scope ?? "");
  } else if (options.yes === true || !interactive) {
    scope = "project";
  } else {
    scope = await promptScope(root, formatPathForDisplay(home, home), options.ask);
  }
  return { providers, scope, installRoot: scope === "global" ? home : root };
}

function writesProjectCursorTree(
  adoption: { providers: ProviderId[]; scope: InstallScope } | undefined,
): boolean {
  return adoption?.scope === "project" && adoption.providers.includes("cursor");
}

function shouldInstallProjectCli(options: InstallOptions): boolean {
  return options.installCli !== false && options.skillsOnly !== true;
}

function projectCliOptions(options: InstallOptions): { runCommand?: RunCommandFn } {
  return options.runCommand === undefined ? {} : { runCommand: options.runCommand };
}

function hasExplicitIntegrations(options: InstallOptions): boolean {
  return (
    options.adapter === true ||
    options.alias === true ||
    options.rule === true ||
    options.cursorHook === true ||
    options.gitHook === true
  );
}

function stdoutDetections(root: string, detections: HarnessDetection[], home: string): void {
  for (const line of formatInstallDetectionLines(root, detections, home)) {
    process.stdout.write(`${line}\n`);
  }
}

function rel(root: string, result: CopyResult): CopyResult {
  return { ...result, path: toPosix(relative(root, result.path)) || result.path };
}
