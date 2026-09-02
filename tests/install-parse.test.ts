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
