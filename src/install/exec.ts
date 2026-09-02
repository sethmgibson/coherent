import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface RunCommandResult {
  stdout: string;
  stderr: string;
}

export type RunCommandFn = (
  file: string,
  args: readonly string[],
  options: { cwd: string },
) => Promise<RunCommandResult>;

export async function defaultRunCommand(
  file: string,
  args: readonly string[],
  options: { cwd: string },
): Promise<RunCommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(file, [...args], {
      cwd: options.cwd,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120_000,
    });
    return { stdout, stderr };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const detail = [err.stderr, err.stdout, err.message].filter(Boolean).join("\n").trim();
    throw new Error(`Command failed: ${file} ${args.join(" ")}\n${detail}`, { cause: error });
  }
}
