import { mkdir, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { ARCHITECTURE_FILE, BACKEND_DIR, COHERENT_DIR, loadConfig } from "../config.js";
import { collectInventory, type Inventory } from "../inventory.js";
import { generateArchitectureMarkdown } from "./architecture.js";
import { refreshArchitectureFile } from "./refresh.js";
import { legacyStateDirWarning, resolveStateDir } from "../state-dir.js";

export { ARCHITECTURE_FILE, BACKEND_DIR, COHERENT_DIR };

export interface InitResult {
  root: string;
  inventory: Inventory;
  architecturePath: string;
  wroteArchitecture: boolean;
  stateDir: string;
  legacyWarning?: string;
}

export async function runInit(
  root: string,
  options: { force?: boolean } = {},
): Promise<InitResult> {
  const { inventory, architecturePath } = await collectArchitectureInput(root);
  const exists = await fileExists(architecturePath);
  let wroteArchitecture = false;
  if (!exists) {
    await writeFile(architecturePath, generateArchitectureMarkdown(inventory), "utf8");
    wroteArchitecture = true;
  } else if (options.force === true) {
    await refreshArchitectureFile(architecturePath, inventory);
    wroteArchitecture = true;
  }

  return finishInit(root, inventory, architecturePath, wroteArchitecture);
}

export async function runRefresh(root: string): Promise<InitResult> {
  const { inventory, architecturePath } = await collectArchitectureInput(root);
  await refreshArchitectureFile(architecturePath, inventory);
  return finishInit(root, inventory, architecturePath, true);
}

function finishInit(
  root: string,
  inventory: Inventory,
  architecturePath: string,
  wroteArchitecture: boolean,
): InitResult {
  const warning = legacyStateDirWarning(root);
  return {
    root,
    inventory,
    architecturePath,
    wroteArchitecture,
    stateDir: resolveStateDir(root).name,
    ...(warning ? { legacyWarning: warning } : {}),
  };
}

async function collectArchitectureInput(root: string): Promise<{
  inventory: Inventory;
  architecturePath: string;
}> {
  const config = await loadConfig(root);
  const inventory = await collectInventory(root, config);
  const state = resolveStateDir(root);
  await mkdir(state.path, { recursive: true });
  return {
    inventory,
    architecturePath: join(state.path, ARCHITECTURE_FILE),
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
