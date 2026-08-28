import { mkdtemp, readFile, rm, writeFile, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runInit } from "../src/init/run.js";

const expressFixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "express-app",
);

async function copyFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "coherent-init-"));
  await cp(expressFixture, root, { recursive: true });
  return root;
}

describe("init", () => {
  it("writes inventory and an architecture file that separates discovery from TODOs", async () => {
    const root = await copyFixture();
    try {
      const result = await runInit(root);
      expect(result.wroteArchitecture).toBe(true);

      const architecture = await readFile(result.architecturePath, "utf8");
      const inventory = JSON.parse(await readFile(result.inventoryPath, "utf8"));

      expect(inventory.frameworks).toEqual(["Express"]);
      expect(architecture).toContain("# Architecture");
      expect(architecture).toContain("express-app");
      expect(architecture).toContain("Express");
      expect(architecture).toContain("`src/index.ts`");
      expect(architecture).toContain("automatically discovered");
      expect(architecture).toContain("requires human or agent completion");
      expect(architecture).toContain("TODO: What this system is for");
      expect(architecture).not.toMatch(/hexagonal|microservice|event-driven/i);
      expect(architecture).toContain("coherent:architecture-schema 1");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not overwrite an existing ARCHITECTURE.md unless forced", async () => {
    const root = await copyFixture();
    try {
      await runInit(root);
      const path = join(root, ".backend", "ARCHITECTURE.md");
      await writeFile(path, "# kept\n", "utf8");

      const skipped = await runInit(root);
      expect(skipped.wroteArchitecture).toBe(false);
      expect(await readFile(path, "utf8")).toBe("# kept\n");

      const forced = await runInit(root, { force: true });
      expect(forced.wroteArchitecture).toBe(true);
      expect(await readFile(path, "utf8")).toContain("# Architecture");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
