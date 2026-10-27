import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const root = new URL("../", import.meta.url);
// Removed source modules must not survive in a previously built package.
await rm(new URL("dist/", root), { recursive: true, force: true });
const result = spawnSync(process.execPath, [
  fileURLToPath(new URL("node_modules/typescript/bin/tsc", root)),
], { cwd: fileURLToPath(root), stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
