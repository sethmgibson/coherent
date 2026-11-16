import { readFileSync } from "node:fs";

interface PackageMetadata {
  name?: unknown;
  version?: unknown;
}

const packageMetadata = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as PackageMetadata;

if (typeof packageMetadata.name !== "string" || packageMetadata.name.length === 0) {
  throw new Error("package.json must define a non-empty name string");
}
if (typeof packageMetadata.version !== "string" || packageMetadata.version.length === 0) {
  throw new Error("package.json must define a non-empty version string");
}

/** The package manifest is the single authority for Coherent's published name and release version. */
export const COHERENT_PACKAGE_NAME = packageMetadata.name;
export const COHERENT_VERSION = packageMetadata.version;
