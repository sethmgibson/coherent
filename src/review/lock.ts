import { open, readFile, rename, unlink, writeFile } from "node:fs/promises";

const LOCK_TIMEOUT_MS = 30_000;
const LOCK_RETRY_MS = 25;

export async function withFileLock<T>(
  lockPath: string,
  fn: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  while (true) {
    try {
      const handle = await open(lockPath, "wx");
      try {
        await handle.writeFile(`${process.pid}\n`);
        return await fn();
      } finally {
        await handle.close();
        await unlink(lockPath).catch(() => undefined);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (await isStaleLock(lockPath)) {
        await unlink(lockPath).catch(() => undefined);
        continue;
      }
      if (Date.now() - started > LOCK_TIMEOUT_MS) {
        throw new Error(`Timed out waiting for lock: ${lockPath}`, { cause: error });
      }
      await delay(LOCK_RETRY_MS);
    }
  }
}

export async function writeFileAtomic(path: string, contents: string): Promise<void> {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tmp, contents, "utf8");
    await rename(tmp, path);
  } catch (error) {
    await unlink(tmp).catch(() => undefined);
    throw error;
  }
}

async function isStaleLock(lockPath: string): Promise<boolean> {
  try {
    const pid = Number.parseInt((await readFile(lockPath, "utf8")).trim(), 10);
    if (!Number.isInteger(pid) || pid <= 0) return true;
    process.kill(pid, 0);
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    return (error as NodeJS.ErrnoException).code === "ESRCH";
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function lockSibling(path: string): string {
  return `${path}.lock`;
}
