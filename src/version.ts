import { readFileSync } from "node:fs";

interface PackageMetadata {
  version?: unknown;
}

const packageMetadata = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as PackageMetadata;

if (typeof packageMetadata.version !== "string" || packageMetadata.version.length === 0) {
  throw new Error("package.json must define a non-empty version string");
}

/** The package manifest is the single authority for Coherent's release version. */
export const COHERENT_VERSION = packageMetadata.version;
