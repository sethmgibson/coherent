import { mkdir, mkdtemp, readFile, rm, writeFile, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runInit, runRefresh } from "../src/init/run.js";

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
  it("keeps inventory in memory and writes only an architecture file", async () => {
    const root = await copyFixture();
    try {
      const result = await runInit(root);
      expect(result.wroteArchitecture).toBe(true);

      const architecture = await readFile(result.architecturePath, "utf8");
      expect(result.inventory.frameworks).toEqual(["Express"]);
      await expect(readFile(join(root, ".coherent", "inventory.json"), "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(architecture).toContain("# Architecture");
      expect(architecture).toContain("express-app");
      expect(architecture).toContain("Express");
      expect(architecture).toContain("`src/index.ts`");
      expect(architecture).toContain("automatically discovered");
      expect(architecture).toContain("requires human or agent completion");
      expect(architecture).toContain("TODO: What this system is for");
      expect(architecture).not.toMatch(/hexagonal|microservice|event-driven/i);
      expect(architecture).toContain("coherent:architecture-schema 1");
      expect(architecture).toContain("<!-- coherent:discovered -->");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not overwrite an existing ARCHITECTURE.md unless forced", async () => {
    const root = await copyFixture();
    try {
      await runInit(root);
      const path = join(root, ".coherent", "ARCHITECTURE.md");
      await writeFile(path, "# kept\n", "utf8");

      const skipped = await runInit(root);
      expect(skipped.wroteArchitecture).toBe(false);
      expect(await readFile(path, "utf8")).toBe("# kept\n");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refresh and init --force preserve confirmed prose and update discovered lists", async () => {
    const root = await copyFixture();
    try {
      await runInit(root);
      const path = join(root, ".coherent", "ARCHITECTURE.md");
      const original = await readFile(path, "utf8");
      const confirmed = original.replace(
        "## System purpose\n\n> Status: requires human or agent completion\n\nTODO: What this system is for, who it serves, and what success means.",
        "## System purpose\n\n> Status: confirmed\n\nKeep this semantic purpose statement.",
      );
      await writeFile(path, confirmed, "utf8");

      const pkgPath = join(root, "package.json");
      const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as {
        dependencies?: Record<string, string>;
      };
      pkg.dependencies = { ...(pkg.dependencies ?? {}), "left-pad": "1.3.0" };
      await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

      const refreshed = await runRefresh(root);
      const afterRefresh = await readFile(path, "utf8");
      expect(refreshed.wroteArchitecture).toBe(true);
      expect(afterRefresh).toContain("Keep this semantic purpose statement.");
      expect(afterRefresh).toContain("Status: confirmed");
      expect(afterRefresh).toMatch(/Dependencies: 2 runtime/);
      expect(afterRefresh).toContain("<!-- coherent:discovered -->");

      await writeFile(
        path,
        afterRefresh.replace("Keep this semantic purpose statement.", "Still confirmed after force."),
        "utf8",
      );
      const forced = await runInit(root, { force: true });
      const afterForce = await readFile(path, "utf8");
      expect(forced.wroteArchitecture).toBe(true);
      expect(afterForce).toContain("Still confirmed after force.");
      expect(afterForce).not.toContain("TODO: What this system is for");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("migrates an unfenced ARCHITECTURE.md without dropping unknown human sections", async () => {
    const root = await copyFixture();
    try {
      const path = join(root, ".coherent", "ARCHITECTURE.md");
      await mkdir(join(root, ".coherent"), { recursive: true });
      await writeFile(
        path,
        `# Architecture

This is an old unfenced file.

## System purpose

> Status: confirmed

Keep this semantic purpose statement.

## Deployment topology

We run three services on Railway. This section is not in the template.

## Domain concepts

> Status: confirmed

Payment and User stay distinct.
`,
        "utf8",
      );

      await runRefresh(root);
      const migrated = await readFile(path, "utf8");
      expect(migrated).toContain("Keep this semantic purpose statement.");
      expect(migrated).toContain("## Deployment topology");
      expect(migrated).toContain("We run three services on Railway. This section is not in the template.");
      expect(migrated).toContain("Payment and User stay distinct.");
      expect(migrated).toContain("<!-- coherent:discovered -->");
      expect(migrated.indexOf("## Deployment topology")).toBeLessThan(
        migrated.indexOf("## Domain concepts"),
      );

      const again = await runRefresh(root);
      expect(again.wroteArchitecture).toBe(true);
      const afterFence = await readFile(path, "utf8");
      expect(afterFence).toContain("## Deployment topology");
      expect(afterFence).toContain("We run three services on Railway. This section is not in the template.");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("writes .coherent/ for a new repo and uses leftover .backend/ with a rename warning", async () => {
    const fresh = await copyFixture();
    try {
      const created = await runInit(fresh);
      expect(created.stateDir).toBe(".coherent");
      expect(created.legacyWarning).toBeUndefined();
      expect(created.architecturePath).toContain(".coherent");
    } finally {
      await rm(fresh, { recursive: true, force: true });
    }

    const leftover = await copyFixture();
    try {
      const legacyDir = join(leftover, ".backend");
      await mkdir(legacyDir, { recursive: true });
      await writeFile(join(legacyDir, "ARCHITECTURE.md"), "# kept leftover\n", "utf8");
      const used = await runInit(leftover);
      expect(used.stateDir).toBe(".backend");
      expect(used.architecturePath).toContain(".backend");
      expect(used.wroteArchitecture).toBe(false);
      expect(used.legacyWarning).toMatch(/Rename it to \.coherent\//);
      expect(await readFile(join(legacyDir, "ARCHITECTURE.md"), "utf8")).toBe("# kept leftover\n");
    } finally {
      await rm(leftover, { recursive: true, force: true });
    }
  });
});
