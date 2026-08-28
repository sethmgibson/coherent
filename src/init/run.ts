import { mkdir, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { ARCHITECTURE_FILE, BACKEND_DIR, loadConfig } from "../config.js";
import { collectInventory, type Inventory } from "../inventory.js";
import { generateArchitectureMarkdown } from "./architecture.js";

export { ARCHITECTURE_FILE, BACKEND_DIR };
export const INVENTORY_FILE = "inventory.json";

export interface InitResult {
  root: string;
  inventory: Inventory;
  architecturePath: string;
  inventoryPath: string;
  wroteArchitecture: boolean;
}

export async function runInit(
  root: string,
  options: { force?: boolean } = {},
): Promise<InitResult> {
  const config = await loadConfig(root);
  const inventory = await collectInventory(root, config);
  const backendDir = join(root, BACKEND_DIR);
  await mkdir(backendDir, { recursive: true });

  const inventoryPath = join(backendDir, INVENTORY_FILE);
  await writeFile(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");

  const architecturePath = join(backendDir, ARCHITECTURE_FILE);
  const exists = await fileExists(architecturePath);
  const wroteArchitecture = !exists || options.force === true;
  if (wroteArchitecture) {
    await writeFile(architecturePath, generateArchitectureMarkdown(inventory), "utf8");
  }

  return {
    root,
    inventory,
    architecturePath,
    inventoryPath,
    wroteArchitecture,
  };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
