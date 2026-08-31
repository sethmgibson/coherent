import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { auditFixture, byRule, findingFor } from "./helpers/audit-fixture.js";

describe("A08 dead-code", () => {
  it("preserves hoisted functions, var bindings, and erased types after return", async () => {
    const { findings } = await auditFixture();
    const unreachable = byRule(findings, "A08").filter((finding) =>
      finding.identity.startsWith("unreachable:"),
    );
    expect(unreachable.some((finding) => finding.identity.includes("actually unreachable"))).toBe(true);
    expect(unreachable.some((finding) => /function visit|type Count|interface Later|var binding/.test(finding.identity))).toBe(false);
  });

  it("keeps implicitly public methods behind review even in a non-exported structural adapter", async () => {
    const { findings } = await auditFixture();
    const dead = byRule(findings, "A08");
    const release = findingFor(dead, "release");
    expect(release?.status).toBe("candidate");
    expect(release?.evidence.details?.join(" ")).toContain("structural type or injected port");
    expect(findingFor(dead, "unusedPrivate")?.status).toBe("confirmed");
    expect(findingFor(dead, "list")?.status).toBe("candidate");
  });

  it("confirms unused internals and unreachable code", async () => {
    const { findings } = await auditFixture();
    const dead = byRule(findings, "A08");

    const internal = findingFor(dead, "neverUsedInternal");
    expect(internal?.status).toBe("confirmed");
    expect(internal?.confidence).toBe("high");
    expect(internal?.evidence.summary).toMatch(/No static references/i);

    expect(findingFor(dead, "unusedConstant")?.status).toBe("confirmed");
    expect(findingFor(dead, "unusedCliLocal")?.status).toBe("confirmed");
    expect(findingFor(dead, "unusedInsidePlugin")?.status).toBe("confirmed");
    expect(dead.some((finding) => finding.title === "Unreachable statement")).toBe(true);
  });

  it("does not confirm public, decorated, CLI, or dynamic-import surfaces", async () => {
    const { findings } = await auditFixture();
    const dead = byRule(findings, "A08");

    expect(findingFor(dead, "usedHelper")).toBeUndefined();
    expect(findingFor(dead, "syncUsers")).toBeUndefined();

    const exported = findingFor(dead, "unusedPublicLookingExport");
    expect(exported?.status).toBe("candidate");

    const publicApi = findingFor(dead, "documentedPublicApi");
    expect(publicApi?.status).not.toBe("confirmed");

    const controller = findingFor(dead, "UsersController");
    expect(controller?.status).not.toBe("confirmed");
    expect(controller?.evidence.details?.join(" ") ?? "").toMatch(/decorator|framework/i);

    const plugin = findingFor(dead, "pluginInit");
    expect(plugin?.status).not.toBe("confirmed");

    const cliExport = findingFor(dead, "unusedCliExport");
    expect(cliExport?.status).not.toBe("confirmed");
  });

  it("does not confirm spec mocks or CJS destructured bindings", async () => {
    const { findings } = await auditFixture();
    const dead = byRule(findings, "A08");

    expect(findingFor(dead, "connect")).toBeUndefined();
    expect(findingFor(dead, "from")).toBeUndefined();
    expect(findingFor(dead, "where")).toBeUndefined();
    expect(findingFor(dead, "jobNames")).toBeUndefined();
    expect(findingFor(dead, "LedgerMock")).toBeUndefined();

    expect(dead.some((finding) => finding.affectedSymbols.includes("{ Pool }"))).toBe(false);
    expect(findingFor(dead, "Pool")).toBeUndefined();
    expect(findingFor(dead, "Client")).toBeUndefined();
  });

  it("resolves imports through tsconfig path aliases", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-paths-"));
    try {
      await mkdir(join(root, "src"), { recursive: true });
      await writeJson(join(root, "package.json"), { type: "module" });
      await writeJson(join(root, "tsconfig.json"), {
        compilerOptions: {
          module: "NodeNext",
          moduleResolution: "NodeNext",
          baseUrl: ".",
          paths: { "@app/*": ["src/*"] },
        },
        include: ["src/**/*.ts"],
      });
      await writeFile(
        join(root, "src", "library.ts"),
        "export function usedThroughAlias(): number { return 1; }\n" +
          "export function unusedAlongsideAlias(): number { return 2; }\n",
        "utf8",
      );
      await writeFile(
        join(root, "src", "index.ts"),
        'import { usedThroughAlias } from "@app/library";\nusedThroughAlias();\n',
        "utf8",
      );

      const { findings } = await auditFixture(root);
      const dead = byRule(findings, "A08");
      expect(findingFor(dead, "usedThroughAlias")).toBeUndefined();
      expect(findingFor(dead, "unusedAlongsideAlias")).toBeDefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uses the owning child config in a project-reference workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-references-"));
    try {
      await mkdir(join(root, "packages", "core", "src"), { recursive: true });
      await mkdir(join(root, "packages", "app", "src"), { recursive: true });
      await writeJson(join(root, "package.json"), {
        private: true,
        workspaces: ["packages/*"],
      });
      await writeJson(join(root, "tsconfig.json"), {
        files: [],
        references: [
          { path: "./packages/core" },
          { path: "./packages/app" },
        ],
      });
      await writeJson(join(root, "packages", "core", "tsconfig.json"), {
        compilerOptions: { composite: true, module: "ESNext", moduleResolution: "Bundler" },
        include: ["src/**/*.ts"],
      });
      await writeJson(join(root, "packages", "app", "tsconfig.json"), {
        compilerOptions: {
          composite: true,
          module: "ESNext",
          moduleResolution: "Bundler",
          baseUrl: ".",
          paths: { "@workspace/core/*": ["../core/src/*"] },
        },
        references: [{ path: "../core" }],
        include: ["src/**/*.ts"],
      });
      await writeFile(
        join(root, "packages", "core", "src", "service.ts"),
        "export function usedAcrossProjectReference(): number { return 1; }\n",
        "utf8",
      );
      await writeFile(
        join(root, "packages", "app", "src", "index.ts"),
        'import { usedAcrossProjectReference } from "@workspace/core/service";\n' +
          "usedAcrossProjectReference();\n",
        "utf8",
      );

      const { findings } = await auditFixture(root);
      expect(
        findingFor(byRule(findings, "A08"), "usedAcrossProjectReference"),
      ).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
