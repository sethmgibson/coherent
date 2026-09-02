import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runAudit } from "../src/audit/run.js";
import { fingerprintFinding } from "../src/domain/finding.js";
import { collectInventory } from "../src/inventory.js";
import { byRule, findingFor } from "./helpers/audit-fixture.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const pythonApp = join(fixtures, "python-app");
const mixedApp = join(fixtures, "mixed-app");

describe("Python inventory and audit", { timeout: 15_000 }, () => {
  it("inventories .py files and pyproject/requirements signals", async () => {
    const inventory = await collectInventory(pythonApp);
    expect(inventory.languages).toEqual(["Python"]);
    expect(inventory.pythonManifests).toEqual(["pyproject.toml", "requirements.txt"]);
    expect(inventory.frameworks).toContain("FastAPI");
    expect(inventory.persistenceLibraries).toContain("sqlalchemy");
    expect(inventory.sourceDirectories).toContain("src");
    expect(inventory.entrypoints).toEqual(expect.arrayContaining([]));
    expect(inventory.fileCount).toBeGreaterThan(5);
    expect(inventory.lineCount).toBeGreaterThan(20);
  });

  it("inventories mixed TypeScript and Python repositories", async () => {
    const inventory = await collectInventory(mixedApp);
    expect(inventory.languages).toEqual(["Python", "TypeScript"]);
    expect(inventory.pythonManifests).toEqual(["pyproject.toml"]);
    expect(inventory.frameworks).toContain("Flask");
    expect(inventory.packageJsonFiles).toEqual(["package.json"]);
    expect(inventory.tsconfigFiles).toEqual(["tsconfig.json"]);
  });

  it("reports only mechanically certain Python unreachable dead code", async () => {
    const { findings } = await runAudit(pythonApp);
    const dead = byRule(findings, "A08");
    expect(dead.every((finding) => finding.status === "confirmed")).toBe(true);
    expect(dead.every((finding) => finding.identity.startsWith("unreachable"))).toBe(true);
    expect(dead.some((finding) => finding.identity.includes("return 2"))).toBe(true);
    expect(dead.some((finding) => finding.identity.includes('return "dead"') || finding.identity.includes("return 'dead'"))).toBe(true);
    expect(dead.some((finding) => finding.identity.startsWith("unreachable-false:"))).toBe(true);
    expect(dead.some((finding) => finding.identity.includes("return 0"))).toBe(false);
    expect(findingFor(dead, "unused_looking_helper")).toBeUndefined();
    expect(findingFor(dead, "health")).toBeUndefined();
    expect(findingFor(dead, "public_lookup")).toBeUndefined();
    expect(findingFor(dead, "persist_charge")).toBeUndefined();
  });

  it("reports Python wrappers, booleans, and exception candidates with rethrow/translation skipped", async () => {
    const { findings } = await runAudit(pythonApp);
    const wrappers = byRule(findings, "B04");
    expect(findingFor(wrappers, "persist_charge")?.status).toBe("candidate");
    expect(findingFor(wrappers, "authorize_and_charge")).toBeUndefined();

    const flags = byRule(findings, "C03");
    expect(findingFor(flags, "create_order")?.status).toBe("candidate");
    expect(findingFor(flags, "toggle_feature")).toBeUndefined();

    const errors = byRule(findings, "D03");
    expect(errors.every((finding) => finding.status === "candidate")).toBe(true);
    expect(findingFor(errors, "load_user")).toBeDefined();
    expect(findingFor(errors, "load_or_log")).toBeDefined();
    expect(findingFor(errors, "load_and_ignore")).toBeDefined();
    expect(findingFor(errors, "load_all")).toBeDefined();
    expect(findingFor(errors, "load_or_rethrow")).toBeUndefined();
    expect(findingFor(errors, "load_or_translate")).toBeUndefined();
  });

  it("audits mixed TypeScript and Python files in one scan", async () => {
    const { findings } = await runAudit(mixedApp);
    expect(findingFor(byRule(findings, "A08"), "neverUsedInternal")?.status).toBe("confirmed");
    expect(byRule(findings, "A08").some((finding) => finding.identity.includes("return 2"))).toBe(true);
    expect(findingFor(byRule(findings, "B04"), "persist_invoice")?.status).toBe("candidate");
  });

  it("keeps Python fingerprints portable and stable across line shifts", async () => {
    const first = await runAudit(pythonApp);
    const second = await runAudit(pythonApp);
    const fingerprints = first.findings.map((finding) => finding.fingerprint).sort();
    expect(second.findings.map((finding) => finding.fingerprint).sort()).toEqual(fingerprints);
    for (const finding of first.findings) {
      expect(finding.fingerprint).toBe(fingerprintFinding(finding));
      expect(finding.identity).not.toMatch(/:\d+:\d+$/);
      expect(finding.locations.every((location) => !location.file.startsWith("/"))).toBe(true);
    }
  });

  it("honors include for Python files, including paths with spaces", async () => {
    const scoped = await runAudit(pythonApp, { include: ["src/with space/mod.py"] });
    expect(scoped.findings.every((finding) => finding.locations[0]?.file === "src/with space/mod.py")).toBe(true);
    expect(byRule(scoped.findings, "A08").some((finding) => finding.identity.includes("return 2"))).toBe(true);
    expect(findingFor(byRule(scoped.findings, "B04"), "persist_charge")).toBeUndefined();

    const empty = await runAudit(pythonApp, { include: [] });
    expect(empty.findings).toEqual([]);
  });

  it("fails closed when Python files are in scope but no interpreter exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-no-python-"));
    try {
      await writeFile(join(root, "app.py"), "x = 1\n", "utf8");
      await writeFile(
        join(root, "coherent.json"),
        `${JSON.stringify({ python: "/definitely/missing/python3" }, null, 2)}\n`,
        "utf8",
      );
      await expect(runAudit(root)).rejects.toThrow(
        /Incomplete analysis: Python files are in scope but no supported interpreter was found[\s\S]*app\.py/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("identifies Python syntax errors by file and line", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-py-syntax-"));
    try {
      await mkdir(join(root, "src"), { recursive: true });
      await writeFile(join(root, "src", "broken.py"), "def missing(\n", "utf8");
      await expect(runAudit(root)).rejects.toThrow(/src\/broken\.py:\d+:\d+:/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("skips local virtualenvs and site-packages", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-py-venv-"));
    try {
      const vendor = join(root, ".pdf-venv", "lib", "python3.14", "site-packages");
      await mkdir(vendor, { recursive: true });
      await writeFile(
        join(vendor, "vendor.py"),
        "def unused_vendor() -> int:\n    return 1\n    return 2\n",
        "utf8",
      );
      await writeFile(
        join(root, "app.py"),
        "def after_return() -> int:\n    return 1\n    return 2\n",
        "utf8",
      );
      const inventory = await collectInventory(root);
      expect(inventory.fileCount).toBe(1);
      expect(inventory.languages).toEqual(["Python"]);
      const { findings } = await runAudit(root);
      expect(findings.every((finding) =>
        finding.locations.every((location) => !location.file.includes("venv") && !location.file.includes("site-packages")),
      )).toBe(true);
      expect(byRule(findings, "A08").some((finding) => finding.identity.includes("return 2"))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not write pycache or other caches during a read-only audit", async () => {
    const { findings } = await runAudit(pythonApp);
    expect(findings.length).toBeGreaterThan(0);
    expect(await collectPycache(pythonApp)).toEqual([]);
  });
});

async function collectPycache(root: string): Promise<string[]> {
  const found: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__pycache__") found.push(absolute);
        else stack.push(absolute);
      }
    }
  }
  return found;
}
