import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { extensionOf } from "../inventory-scan.js";
import { toPosix } from "../inventory-walk.js";

const execFileAsync = promisify(execFile);
const TS_LIKE = new Set([".ts", ".tsx", ".mts", ".cts"]);

export interface ChangedSourceFiles {
  existing: string[];
  deleted: string[];
}

export async function listChangedSourceFiles(root: string): Promise<ChangedSourceFiles> {
  await assertGitRepo(root);
  const names = await listChangedNames(root);
  const existing: string[] = [];
  const deleted: string[] = [];
  for (const name of names) {
    const relative = toPosix(name);
    if (!isTsLikeSource(relative)) continue;
    if (await pathExists(join(root, relative))) existing.push(relative);
    else deleted.push(relative);
  }
  return { existing, deleted };
}

function isTsLikeSource(relative: string): boolean {
  if (relative.endsWith(".d.ts")) return false;
  return TS_LIKE.has(extensionOf(relative));
}

async function listChangedNames(root: string): Promise<string[]> {
  const names = new Set<string>();
  if (await gitOk(root, ["rev-parse", "--verify", "HEAD"])) {
    addLines(names, await git(root, ["diff", "--name-only", "HEAD"]));
  } else {
    addLines(names, await git(root, ["diff", "--name-only"]));
    addLines(names, await git(root, ["diff", "--cached", "--name-only"]));
  }
  addLines(names, await git(root, ["ls-files", "--others", "--exclude-standard"]));
  return [...names];
}

async function assertGitRepo(root: string): Promise<void> {
  if (await gitOk(root, ["rev-parse", "--is-inside-work-tree"])) return;
  throw new Error(`--changed requires a git repository. ${root} is not inside a work tree.`);
}

async function gitOk(root: string, args: string[]): Promise<boolean> {
  try {
    await git(root, args);
    return true;
  } catch {
    return false;
  }
}

async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: root });
  return stdout;
}

function addLines(target: Set<string>, stdout: string): void {
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) target.add(trimmed);
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
