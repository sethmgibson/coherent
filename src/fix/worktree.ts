import { execFile } from "node:child_process";

export interface WorktreeTargetInspection {
  dirtyFiles: string[];
  warning?: string;
}

const GIT_STATUS_TIMEOUT_MS = 5_000;

export async function inspectWorktreeTargets(
  root: string,
  files: readonly string[],
): Promise<WorktreeTargetInspection> {
  const unique = [...new Set(files)].sort();
  if (unique.length === 0) return { dirtyFiles: [] };
  return new Promise((resolve) => {
    execFile(
      "git",
      ["status", "--porcelain=v1", "--untracked-files=all", "-z", "--", ...unique],
      { cwd: root, timeout: GIT_STATUS_TIMEOUT_MS },
      (error, stdout) => {
        if (!error) {
          resolve({ dirtyFiles: dirtyFilesFromStatus(stdout, unique) });
          return;
        }
        if (isMissingGitRepository(error)) {
          resolve({ dirtyFiles: [] });
          return;
        }
        resolve({
          dirtyFiles: [],
          warning: `Could not inspect target-file Git status: ${error.message}`,
        });
      },
    );
  });
}

function dirtyFilesFromStatus(stdout: string, requested: readonly string[]): string[] {
  const wanted = new Set(requested);
  const dirty = new Set<string>();
  for (const record of stdout.split("\0")) {
    if (!record) continue;
    const path = record.length >= 3 && record[2] === " " ? record.slice(3) : record;
    if (wanted.has(path)) dirty.add(path);
  }
  return [...dirty].sort();
}

function isMissingGitRepository(error: Error): boolean {
  return /not a git repository/i.test(error.message);
}
