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
  // NUL records preserve Git-quoted names. Disable rename detection so both
  // the deleted source and added destination participate in drift comparison.
  const diffArgs = ["--name-only", "-z", "--relative", "--no-renames"];
  if (await gitOk(root, ["rev-parse", "--verify", "HEAD"])) {
    addPaths(names, await git(root, ["diff", ...diffArgs, "HEAD", "--", "."]));
  } else {
    addPaths(names, await git(root, ["diff", ...diffArgs, "--", "."]));
    addPaths(names, await git(root, ["diff", "--cached", ...diffArgs, "--", "."]));
  }
  addPaths(names, await git(root, ["ls-files", "--others", "--exclude-standard", "-z", "--", "."]));
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

function addPaths(target: Set<string>, stdout: string): void {
  for (const path of stdout.split("\0")) {
    if (path) target.add(path);
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
