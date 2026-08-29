import { existsSync } from "node:fs";
import { join } from "node:path";
import { COHERENT_DIR, LEGACY_BACKEND_DIR } from "./config.js";

export interface ResolvedStateDir {
  name: string;
  path: string;
  leftoverLegacy: boolean;
}

export function resolveStateDir(root: string): ResolvedStateDir {
  const coherent = join(root, COHERENT_DIR);
  const legacy = join(root, LEGACY_BACKEND_DIR);
  const hasCoherent = existsSync(coherent);
  const hasLegacy = existsSync(legacy);
  if (hasCoherent) {
    return { name: COHERENT_DIR, path: coherent, leftoverLegacy: hasLegacy };
  }
  if (hasLegacy) {
    return { name: LEGACY_BACKEND_DIR, path: legacy, leftoverLegacy: false };
  }
  return { name: COHERENT_DIR, path: coherent, leftoverLegacy: false };
}

export function legacyStateDirWarning(root: string): string | undefined {
  const resolved = resolveStateDir(root);
  if (resolved.name === LEGACY_BACKEND_DIR) {
    return `Found ${LEGACY_BACKEND_DIR}/. Rename it to ${COHERENT_DIR}/ (mv ${LEGACY_BACKEND_DIR} ${COHERENT_DIR}).`;
  }
  if (resolved.leftoverLegacy) {
    return `Found leftover ${LEGACY_BACKEND_DIR}/ next to ${COHERENT_DIR}/. Using ${COHERENT_DIR}/. Remove ${LEGACY_BACKEND_DIR}/ after migrating any unique files.`;
  }
  return undefined;
}
