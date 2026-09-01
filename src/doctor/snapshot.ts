import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type DoctorTargetKind = "worktree" | "staged" | "ref";

export interface DoctorValidationTarget {
  kind: DoctorTargetKind;
  ref?: string;
  gitHead?: string;
  worktreeDirty?: boolean;
}

export interface DoctorSnapshotOptions {
  staged?: boolean;
  ref?: string;
}

export async function withDoctorSnapshot<T>(
  root: string,
  options: DoctorSnapshotOptions,
  inspect: (snapshotRoot: string, target: DoctorValidationTarget) => Promise<T>,
): Promise<T> {
  if (options.staged && options.ref) {
    throw new Error("Choose either --staged or --ref, not both.");
  }
  const resolved = await realpath(resolve(root));
  const git = await gitMetadata(resolved);
  if (!options.staged && !options.ref) {
    return inspect(resolved, { kind: "worktree", ...git });
  }

  const top = await gitTopLevel(resolved);
  const targetRelative = relative(top, resolved);
  if (isAbsolute(targetRelative) || targetRelative.startsWith(`..${sep}`) || targetRelative === "..") {
    throw new Error(`${resolved} is outside Git work tree ${top}.`);
  }
  const snapshotDirectory = await mkdtemp(join(tmpdir(), "coherent-doctor-snapshot-"));
  const exported = join(snapshotDirectory, "tree");
  await mkdir(exported);
  let validatedCommit = git.gitHead;
  try {
    if (options.staged) {
      await execFileAsync(
        "git",
        ["checkout-index", "--all", "--force", `--prefix=${exported}${sep}`],
        { cwd: top, maxBuffer: 10 * 1024 * 1024 },
      );
    } else {
      const ref = options.ref!;
      const { stdout } = await execFileAsync(
        "git",
        ["rev-parse", "--verify", `${ref}^{commit}`],
        { cwd: top },
      );
      validatedCommit = stdout.trim();
      const archive = join(snapshotDirectory, "snapshot.tar");
      await execFileAsync(
        "git",
        ["archive", "--format=tar", `--output=${archive}`, validatedCommit],
        { cwd: top, maxBuffer: 10 * 1024 * 1024 },
      );
      await execFileAsync("tar", ["-xf", archive, "-C", exported], {
        maxBuffer: 10 * 1024 * 1024,
      });
    }
    const snapshotRoot = join(exported, targetRelative);
    await access(snapshotRoot);
    return await inspect(snapshotRoot, {
      kind: options.staged ? "staged" : "ref",
      ...(options.ref ? { ref: options.ref } : {}),
      ...git,
      ...(validatedCommit ? { gitHead: validatedCommit } : {}),
    });
  } finally {
    await rm(snapshotDirectory, { recursive: true, force: true });
  }
}

async function gitMetadata(root: string): Promise<{
  gitHead?: string;
  worktreeDirty?: boolean;
}> {
  try {
    const [{ stdout: head }, { stdout: status }] = await Promise.all([
      execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root }),
      execFileAsync("git", ["status", "--porcelain"], { cwd: root }),
    ]);
    return { gitHead: head.trim(), worktreeDirty: status.length > 0 };
  } catch {
    return {};
  }
}

async function gitTopLevel(root: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], {
      cwd: root,
    });
    return await realpath(stdout.trim());
  } catch (error) {
    throw new Error(`Git snapshot validation requires a Git work tree: ${root}`, {
      cause: error,
    });
  }
}
