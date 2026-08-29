import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = join(root, ".coherent", "baseline.json");
const raw = JSON.parse(await readFile(baselinePath, "utf8")) as {
  findings?: { fingerprint?: string }[];
};

const fingerprints = (raw.findings ?? []).map((entry, index) => {
  if (typeof entry.fingerprint !== "string" || entry.fingerprint.length === 0) {
    throw new Error(`baseline.json findings[${index}] is missing a fingerprint`);
  }
  return entry.fingerprint;
});

if (fingerprints.length === 0) {
  throw new Error("Committed baseline.json has no findings");
}

const seen = new Set<string>();
for (const fingerprint of fingerprints) {
  if (seen.has(fingerprint)) {
    throw new Error(`Duplicate fingerprint in committed baseline: ${fingerprint}`);
  }
  seen.add(fingerprint);
}

console.log(
  `OK: ${fingerprints.length} unique fingerprint(s) in .coherent/baseline.json`,
);
