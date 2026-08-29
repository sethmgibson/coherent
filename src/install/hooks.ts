import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { CopyResult } from "./copy.js";
import { destGitHook, destHookScript, destHooksJson } from "./paths.js";

export const HOOK_MARKER = "coherent:check-changed";
export const CURSOR_HOOK_COMMAND = ".cursor/hooks/coherent-check.sh";

const CURSOR_HOOK_SCRIPT = `#!/bin/sh
# ${HOOK_MARKER}
# Fast prevention check on changed files. Full audit stays explicit.
if [ ! -t 0 ]; then
  cat >/dev/null
fi
root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$root" || exit 0
run_check
echo '{}'
exit 0
`;

const GIT_HOOK_SCRIPT = `#!/bin/sh
# ${HOOK_MARKER}
# Fast prevention check on changed files. Full audit stays explicit.
root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$root" || exit 0
run_check
`;

const RUN_CHECK = `
run_check() {
  if [ -x "$root/node_modules/.bin/coherent" ]; then
    "$root/node_modules/.bin/coherent" check --changed
  elif command -v coherent >/dev/null 2>&1; then
    coherent check --changed
  else
    echo "coherent is not installed; skipped check --changed" >&2
  fi
}
`;

export async function writePreventionHooks(root: string): Promise<CopyResult[]> {
  return [
    await writeScript(destHookScript(root), withRunner(CURSOR_HOOK_SCRIPT)),
    await mergeCursorHooksJson(root),
    await writeGitHook(root),
  ];
}

function withRunner(script: string): string {
  return script.replace("run_check\n", `${RUN_CHECK.trim()}\nrun_check\n`);
}

async function writeScript(dest: string, shipped: string): Promise<CopyResult> {
  let existing: string | undefined;
  try {
    existing = await readFile(dest, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (existing === shipped) return { path: dest, action: "unchanged" };
  if (existing !== undefined && !existing.includes(HOOK_MARKER)) {
    return { path: dest, action: "skipped", reason: "user edits" };
  }
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, shipped, "utf8");
  await chmod(dest, 0o755);
  return { path: dest, action: existing === undefined ? "wrote" : "updated" };
}

async function mergeCursorHooksJson(root: string): Promise<CopyResult> {
  const dest = destHooksJson(root);
  let existing: HooksFile | undefined;
  try {
    const raw = JSON.parse(await readFile(dest, "utf8")) as unknown;
    if (!isHooksFile(raw)) {
      return { path: dest, action: "skipped", reason: "hooks.json is not a Cursor hooks file" };
    }
    existing = raw;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      return { path: dest, action: "skipped", reason: "hooks.json is not valid JSON" };
    }
  }
  const next = mergeStopHook(existing);
  const serialized = `${JSON.stringify(next, null, 2)}\n`;
  if (existing && JSON.stringify(existing) === JSON.stringify(next)) {
    return { path: dest, action: "unchanged" };
  }
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, serialized, "utf8");
  return { path: dest, action: existing ? "updated" : "wrote" };
}

async function writeGitHook(root: string): Promise<CopyResult> {
  const dest = destGitHook(root);
  try {
    const info = await stat(dirname(dirname(dest)));
    if (!info.isDirectory()) {
      return { path: dest, action: "skipped", reason: "no .git directory" };
    }
  } catch {
    return { path: dest, action: "skipped", reason: "no .git directory" };
  }
  return writeScript(dest, withRunner(GIT_HOOK_SCRIPT));
}

interface HookEntry {
  command?: string;
  type?: string;
  timeout?: number;
}

interface HooksFile {
  version: number;
  hooks: Record<string, HookEntry[]>;
}

function mergeStopHook(existing: HooksFile | undefined): HooksFile {
  const hooks = existing ?? { version: 1, hooks: {} };
  const stop = hooks.hooks.stop ?? [];
  if (stop.some((entry) => entry.command === CURSOR_HOOK_COMMAND)) return hooks;
  return {
    version: hooks.version ?? 1,
    hooks: {
      ...hooks.hooks,
      stop: [...stop, { command: CURSOR_HOOK_COMMAND }],
    },
  };
}

function isHooksFile(value: unknown): value is HooksFile {
  if (value === null || typeof value !== "object") return false;
  const record = value as { version?: unknown; hooks?: unknown };
  return typeof record.version === "number" && record.hooks !== null && typeof record.hooks === "object";
}

