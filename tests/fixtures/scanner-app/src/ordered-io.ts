import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value), "utf8");
  await chmod(path, 0o644);
}

export async function writeWhenEnabled(path: string, enabled: boolean): Promise<void> {
  if (enabled) {
    await writeFile(path, "enabled", "utf8");
  }
  await writeFile(`${path}.status`, "done", "utf8");
}
