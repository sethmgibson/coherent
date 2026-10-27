import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { PREVENTION_CLOSE, PREVENTION_OPEN, writeManagedFile } from "../src/install/copy.js";
import { CURSOR_HOOK_COMMAND, HOOK_MARKER } from "../src/install/hooks.js";
import { runInstall, runUpdate } from "../src/install/run.js";
import { copySkillTree, writeShippedFile } from "../src/install/skill-tree.js";

const execFileAsync = promisify(execFile);

describe.each([
  { name: "managed adapter", write: (dest: string, shipped: string) => writeManagedFile(dest, shipped, "adapter") },
  { name: "shipped skill", write: (dest: string, shipped: string) => writeShippedFile(dest, shipped, "skill") },
])("$name legacy stub replacement", ({ write }) => {
  it.each(["This is a Cursor adapter", "Alias for /coherent", "skill alias for Coherent"])(
    "replaces a short %s stub and preserves a longer authored lookalike",
    async (phrase) => {
      const root = await mkdtemp(join(tmpdir(), "coherent-stub-"));
      const dest = join(root, "SKILL.md");
      const shipped = "canonical skill\n";
      try {
        const stub = `${phrase}. See skills/coherent/SKILL.md\n${"\n".repeat(38)}`;
        await writeFile(dest, stub, "utf8");
        expect(await write(dest, shipped)).toMatchObject({ action: "updated" });
        expect(await readFile(dest, "utf8")).toBe(shipped);

        const authored = `${stub}Custom instructions\n`;
        await writeFile(dest, authored, "utf8");
        expect(await write(dest, shipped)).toMatchObject({ action: "skipped", reason: "user edits" });
        expect(await readFile(dest, "utf8")).toBe(authored);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );
});

describe("install and update", () => {
  it("keeps legacy stub replacement limited to skill entrypoints", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-stub-kinds-"));
    const stub = "Alias for /coherent. See skills/coherent/SKILL.md\n";
    try {
      const dest = join(root, "authored.md");
      await writeFile(dest, stub, "utf8");
      expect(await writeManagedFile(dest, "prevention rule\n", "prevention")).toMatchObject({ action: "skipped" });
      expect(await writeShippedFile(dest, "reference\n", "reference")).toMatchObject({ action: "skipped" });
      expect(await writeShippedFile(dest, "other\n", "other")).toMatchObject({ action: "skipped" });
      expect(await readFile(dest, "utf8")).toBe(stub);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects an existing adapter before replacing its skill tree", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-adapter-tree-"));
    const source = join(root, "source");
    const dest = join(root, "dest");
    const adapter = "This is a Cursor adapter. See ../../../skills/coherent/SKILL.md\n";
    try {
      await mkdir(source);
      await mkdir(dest);
      await writeFile(join(source, "SKILL.md"), "canonical skill\n", "utf8");
      await writeFile(join(source, "reference.md"), "new reference\n", "utf8");
      await writeFile(join(dest, "SKILL.md"), adapter, "utf8");
      expect(await copySkillTree(source, dest)).toEqual([
        { path: join(dest, "SKILL.md"), action: "skipped", reason: "existing adapter" },
      ]);
      expect(await readFile(join(dest, "SKILL.md"), "utf8")).toBe(adapter);
      await expect(readFile(join(dest, "reference.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("writes nothing without explicit integration flags", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-install-empty-"));
    try {
      const result = await runInstall(root);
      expect(result.actions).toEqual([]);
      await expect(readFile(join(root, ".cursor", "hooks.json"), "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("copies only explicitly selected Cursor integrations", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-install-"));
    try {
      const result = await runInstall(root, {
        adapter: true,
        alias: true,
        rule: true,
        cursorHook: true,
      });
      const paths = result.actions.map((action) => action.path);

      expect(paths).toContain(".cursor/skills/coherent/SKILL.md");
      expect(paths).toContain(".cursor/skills/backend/SKILL.md");
      expect(paths).toContain(".cursor/rules/backend-prevention.mdc");
      expect(paths).toContain(".cursor/hooks/coherent-check.sh");
      expect(paths).toContain(".cursor/hooks.json");
      expect(paths).not.toContain(".git/hooks/pre-commit");

      const adapter = await readFile(join(root, ".cursor", "skills", "coherent", "SKILL.md"), "utf8");
      expect(adapter).toContain("runtime.skillPath");
      expect(adapter).toContain("<!-- coherent:adapter -->");

      const alias = await readFile(join(root, ".cursor", "skills", "backend", "SKILL.md"), "utf8");
      expect(alias).toContain("Alias for /coherent");

      const prevention = await readFile(
        join(root, ".cursor", "rules", "backend-prevention.mdc"),
        "utf8",
      );
      expect(prevention).toContain("coherent check --changed");

      const hooks = JSON.parse(await readFile(join(root, ".cursor", "hooks.json"), "utf8")) as {
        hooks: { stop: { command: string }[] };
      };
      expect(hooks.hooks.stop.map((entry) => entry.command)).toContain(CURSOR_HOOK_COMMAND);

      const script = await readFile(join(root, ".cursor", "hooks", "coherent-check.sh"), "utf8");
      expect(script).toContain(HOOK_MARKER);
      expect(script).toContain("check --changed");
      expect(script).toContain("baseline is not configured");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refreshes adapter stubs and fenced interiors without overwriting user edits", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-update-"));
    try {
      await runInstall(root, { adapter: true, rule: true });

      await writeFile(
        join(root, ".cursor", "rules", "backend-prevention.mdc"),
        "custom prevention. do not overwrite.\n",
        "utf8",
      );
      const skipped = await runUpdate(root, { adapter: true, rule: true });
      expect(
        skipped.actions.find((action) => action.path === ".cursor/rules/backend-prevention.mdc"),
      ).toMatchObject({ action: "skipped", reason: "user edits" });
      expect(await readFile(join(root, ".cursor", "rules", "backend-prevention.mdc"), "utf8")).toBe(
        "custom prevention. do not overwrite.\n",
      );

      await writeFile(
        join(root, ".cursor", "rules", "backend-prevention.mdc"),
        `---\ndescription: custom title\n---\n\nkeep this preface\n\n${PREVENTION_OPEN}\nold interior\n${PREVENTION_CLOSE}\n`,
        "utf8",
      );
      await runUpdate(root, { adapter: true, rule: true });
      const fenced = await readFile(join(root, ".cursor", "rules", "backend-prevention.mdc"), "utf8");
      expect(fenced).toContain("description: custom title");
      expect(fenced).toContain("keep this preface");
      expect(fenced).toContain("coherent check --changed");
      expect(fenced).not.toContain("old interior");

      await writeFile(
        join(root, ".cursor", "skills", "coherent", "SKILL.md"),
        "---\nname: coherent\n---\n\nThis is a Cursor adapter. See skills/coherent/SKILL.md\n",
        "utf8",
      );
      const stub = await runUpdate(root, { adapter: true });
      expect(
        stub.actions.find((action) => action.path === ".cursor/skills/coherent/SKILL.md")?.action,
      ).toBe("updated");
      const refreshed = await readFile(
        join(root, ".cursor", "skills", "coherent", "SKILL.md"),
        "utf8",
      );
      expect(refreshed).toContain("<!-- coherent:adapter -->");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("skips a malformed Cursor hooks.json without overwriting it", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-hooks-bad-"));
    try {
      await mkdir(join(root, ".cursor"), { recursive: true });
      await writeFile(join(root, ".cursor", "hooks.json"), "{not json", "utf8");
      const result = await runInstall(root, { cursorHook: true });
      expect(result.actions.find((action) => action.path === ".cursor/hooks.json")).toMatchObject({
        action: "skipped",
        reason: "hooks.json is not valid JSON",
      });
      expect(await readFile(join(root, ".cursor", "hooks.json"), "utf8")).toBe("{not json");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("merges Cursor hooks and writes a git hook only when safe", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-hooks-"));
    const clean = await mkdtemp(join(tmpdir(), "coherent-githook-"));
    try {
      await mkdir(join(root, ".cursor"), { recursive: true });
      await writeFile(
        join(root, ".cursor", "hooks.json"),
        `${JSON.stringify({ version: 1, hooks: { afterFileEdit: [{ command: "fmt.sh" }] } }, null, 2)}\n`,
        "utf8",
      );
      await execFileAsync("git", ["init", "-b", "main"], { cwd: root });
      await mkdir(join(root, ".git", "hooks"), { recursive: true });
      await writeFile(join(root, ".git", "hooks", "pre-commit"), "#!/bin/sh\necho mine\n", "utf8");

      const result = await runInstall(root, { cursorHook: true, gitHook: true });
      const hooks = JSON.parse(await readFile(join(root, ".cursor", "hooks.json"), "utf8")) as {
        hooks: { afterFileEdit: { command: string }[]; stop: { command: string }[] };
      };
      expect(hooks.hooks.afterFileEdit).toEqual([{ command: "fmt.sh" }]);
      expect(hooks.hooks.stop.map((entry) => entry.command)).toContain(CURSOR_HOOK_COMMAND);
      expect(result.actions.find((action) => action.path === ".git/hooks/pre-commit")).toMatchObject({
        action: "skipped",
        reason: "user edits",
      });
      expect(await readFile(join(root, ".git", "hooks", "pre-commit"), "utf8")).toBe(
        "#!/bin/sh\necho mine\n",
      );

      await execFileAsync("git", ["init", "-b", "main"], { cwd: clean });
      await runInstall(clean, { gitHook: true });
      const gitHook = await readFile(join(clean, ".git", "hooks", "pre-commit"), "utf8");
      expect(gitHook).toContain(HOOK_MARKER);
      expect(gitHook).toContain("check --changed");
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(clean, { recursive: true, force: true });
    }
  });
});
