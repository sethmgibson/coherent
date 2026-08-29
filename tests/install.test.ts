import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { PREVENTION_CLOSE, PREVENTION_OPEN } from "../src/install/copy.js";
import { CURSOR_HOOK_COMMAND, HOOK_MARKER } from "../src/install/hooks.js";
import { runInstall, runUpdate } from "../src/install/run.js";

const execFileAsync = promisify(execFile);

describe("install and update", () => {
  it("copies the Cursor adapter, prevention rule, and hooks", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-install-"));
    try {
      const result = await runInstall(root);
      const paths = result.actions.map((action) => action.path);

      expect(paths).toContain(".cursor/skills/coherent/SKILL.md");
      expect(paths).toContain(".cursor/skills/backend/SKILL.md");
      expect(paths).toContain(".cursor/rules/backend-prevention.mdc");
      expect(paths).toContain(".cursor/hooks/coherent-check.sh");
      expect(paths).toContain(".cursor/hooks.json");
      expect(result.actions.find((action) => action.path === ".git/hooks/pre-commit")?.action).toBe(
        "skipped",
      );

      const adapter = await readFile(join(root, ".cursor", "skills", "coherent", "SKILL.md"), "utf8");
      expect(adapter).toContain("skills/coherent/SKILL.md");
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
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refreshes adapter stubs and fenced interiors without overwriting user edits", async () => {
    const root = await mkdtemp(join(tmpdir(), "coherent-update-"));
    try {
      await runInstall(root, { hooks: false });

      await writeFile(
        join(root, ".cursor", "rules", "backend-prevention.mdc"),
        "custom prevention. do not overwrite.\n",
        "utf8",
      );
      const skipped = await runUpdate(root, { hooks: false });
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
      await runUpdate(root, { hooks: false });
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
      const stub = await runUpdate(root, { hooks: false, rule: false });
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

      const result = await runInstall(root, { rule: false });
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
      await runInstall(clean, { rule: false });
      const gitHook = await readFile(join(clean, ".git", "hooks", "pre-commit"), "utf8");
      expect(gitHook).toContain(HOOK_MARKER);
      expect(gitHook).toContain("check --changed");
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(clean, { recursive: true, force: true });
    }
  });
});
