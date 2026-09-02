import { chmod, mkdir, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  collectInstallDetections,
  commandOnPath,
  defaultDetectedProviders,
  formatPathForDisplay,
} from "../src/install/detect.js";
import {
  normalizeInstallScope,
  parseInstallScope,
  parseProviderList,
  parseProvidersOption,
} from "../src/install/providers.js";
import {
  GITHUB_PACKAGE_SPEC,
  addCliCommand,
  cliInstallArgv,
  isSameCoherentPackageSpec,
  resolveInstallManager,
} from "../src/install/spec.js";

describe("install provider and scope parsing", () => {
  it("parses aliases, trims spaces, and rejects unknown names", () => {
    expect(parseProviderList("codex, cursor")).toEqual({ providers: ["codex", "cursor"], invalid: [] });
    expect(parseProviderList(" .agents , .cursor ")).toEqual({
      providers: ["codex", "cursor"],
      invalid: [],
    });
    expect(parseProviderList("codex,codex,.codex")).toEqual({ providers: ["codex"], invalid: [] });
    expect(parseProviderList("claude,cursor")).toEqual({ providers: ["cursor"], invalid: ["claude"] });
    expect(() => parseProvidersOption("codex, claude")).toThrow(/Unknown provider/);
    expect(() => parseProvidersOption("   ")).toThrow(/at least one provider/);
  });

  it("accepts project and global aliases and rejects unknown scopes", () => {
    expect(normalizeInstallScope("project")).toBe("project");
    expect(normalizeInstallScope("LOCAL")).toBe("project");
    expect(normalizeInstallScope("global")).toBe("global");
    expect(normalizeInstallScope("user")).toBe("global");
    expect(normalizeInstallScope("home")).toBe("global");
    expect(normalizeInstallScope("cloud")).toBeUndefined();
    expect(() => parseInstallScope("cloud")).toThrow(/--scope=project or --scope=global/);
  });
});

describe("install CLI specifier argv", () => {
  it("builds fixed argv for each supported manager and defaults unknown to npm", () => {
    expect(cliInstallArgv("pnpm")).toEqual({
      command: "pnpm",
      args: ["add", "--save-dev", GITHUB_PACKAGE_SPEC],
    });
    expect(cliInstallArgv("npm")).toEqual({
      command: "npm",
      args: ["install", "--save-dev", GITHUB_PACKAGE_SPEC],
    });
    expect(cliInstallArgv("yarn")).toEqual({
      command: "yarn",
      args: ["add", "--dev", GITHUB_PACKAGE_SPEC],
    });
    expect(cliInstallArgv("bun")).toEqual({
      command: "bun",
      args: ["add", "--dev", GITHUB_PACKAGE_SPEC],
    });
    expect(resolveInstallManager("unknown")).toBe("npm");
    expect(cliInstallArgv("unknown")).toEqual(cliInstallArgv("npm"));
    expect(addCliCommand("pnpm")).toBe(`pnpm add --save-dev ${GITHUB_PACKAGE_SPEC}`);
  });

  it("treats the same GitHub package as compatible and other specs as conflicts", () => {
    expect(isSameCoherentPackageSpec(GITHUB_PACKAGE_SPEC)).toBe(true);
    expect(isSameCoherentPackageSpec("github:sethmgibson/coherent#abc123")).toBe(true);
    expect(isSameCoherentPackageSpec("github:sethmgibson/coherent.git")).toBe(true);
    expect(isSameCoherentPackageSpec("sethmgibson/coherent")).toBe(true);
    expect(isSameCoherentPackageSpec("git+https://github.com/sethmgibson/coherent.git")).toBe(true);
    expect(isSameCoherentPackageSpec("^1.0.0")).toBe(false);
    expect(isSameCoherentPackageSpec("github:other/coherent")).toBe(false);
    expect(isSameCoherentPackageSpec("github:sethmgibson/coherent-evil")).toBe(false);
    expect(isSameCoherentPackageSpec("file:../coherent.tgz")).toBe(false);
  });
});

describe("install harness detection", () => {
  it("detects project folders, user folders, and PATH CLIs without reading the real home", async () => {
    const project = await mkdtemp(join(tmpdir(), "coherent-detect-project-"));
    const home = await mkdtemp(join(tmpdir(), "coherent-detect-home-"));
    const bin = await mkdtemp(join(tmpdir(), "coherent-detect-bin-"));
    try {
      await mkdir(join(project, ".cursor"));
      await mkdir(join(project, ".agents"));
      await mkdir(join(home, ".codex"));
      const cursorBin = join(bin, "cursor");
      await writeFile(cursorBin, "#!/bin/sh\n", "utf8");
      await chmod(cursorBin, 0o755);

      const detections = collectInstallDetections(project, home, bin);
      expect(detections.some((item) => item.provider === "cursor" && item.scope === "project")).toBe(true);
      expect(detections.some((item) => item.provider === "codex" && item.scope === "project")).toBe(true);
      expect(detections.some((item) => item.provider === "codex" && item.scope === "global")).toBe(true);
      expect(detections.some((item) => item.provider === "cursor" && item.reason === "CLI on PATH")).toBe(true);
      expect(defaultDetectedProviders(detections)).toEqual(["codex", "cursor"]);
      expect(commandOnPath("cursor", bin)).toBe(cursorBin);
      expect(commandOnPath("missing", bin)).toBeUndefined();
    } finally {
      await rm(project, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
      await rm(bin, { recursive: true, force: true });
    }
  });

  it("formats home paths and prefers project detections over global defaults", async () => {
    const project = await mkdtemp(join(tmpdir(), "coherent-detect-pref-"));
    const home = await mkdtemp(join(tmpdir(), "coherent-detect-pref-home-"));
    try {
      await mkdir(join(project, ".cursor"));
      await mkdir(join(home, ".codex"));
      const detections = collectInstallDetections(project, home, "");
      expect(defaultDetectedProviders(detections)).toEqual(["cursor"]);
      expect(formatPathForDisplay(join(home, ".codex"), home)).toBe("~/.codex");
      expect(formatPathForDisplay(home, home)).toBe("~");
    } finally {
      await rm(project, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
    }
  });
});
