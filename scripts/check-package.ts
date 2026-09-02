import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { publint } from "publint";
import { formatMessage } from "publint/utils";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = await realpath(await mkdtemp(join(tmpdir(), "coherent-package-")));

function run(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
    // Installed consumers must not inherit loaders or module paths from tsx/the checkout.
    env: { ...process.env, NODE_PATH: "", NODE_OPTIONS: "" },
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status ?? result.signal})\n${result.stdout}\n${result.stderr}`,
      { cause: result.error },
    );
  }
  return result.stdout;
}

try {
  console.log("Packing Coherent (prepack builds the published JavaScript and declarations)...");
  const tarball = join(temporaryRoot, "coherent.tgz");
  run("pnpm", ["pack", "--out", tarball], repoRoot);

  const { messages, pkg } = await publint({
    pack: { tarball: new Uint8Array(await readFile(tarball)).buffer },
    strict: true,
  });
  for (const message of messages) console.log(formatMessage(message, pkg) ?? message.code);
  assert(!messages.some((message) => message.type === "error"), "Packed package failed publint");
  console.log("publint passed (warnings are errors).");

  const consumer = join(temporaryRoot, "consumer");
  await mkdir(consumer);
  await writeFile(join(consumer, "package.json"), JSON.stringify({
    name: "coherent-packed-package-consumer",
    private: true,
    type: "module",
    dependencies: { coherent: `file:${tarball}` },
  }));
  console.log("Installing only the tarball and its runtime dependencies outside the checkout...");
  run("pnpm", [
    "install", "--prod", "--ignore-scripts", "--no-frozen-lockfile",
    "--config.package-import-method=copy",
  ], consumer);

  const installed = await realpath(join(consumer, "node_modules", "coherent"));
  const installedRelative = relative(temporaryRoot, installed);
  assert(!isAbsolute(installedRelative) && !installedRelative.startsWith(".."), "Install escaped the isolated consumer");
  const manifest = JSON.parse(await readFile(join(installed, "package.json"), "utf8")) as {
    version: string;
    exports: Record<string, unknown>;
  };
  // Adding a public entrypoint requires extending the consumer fixture too.
  assert.deepEqual(Object.keys(manifest.exports).sort(), [
    "./catalog/phases", "./catalog/rules", "./catalog/types", "./finding",
  ]);

  for (const name of ["coherent", "backend"]) {
    const binary = join(consumer, "node_modules", ".bin", name);
    assert.equal(run(binary, ["--version"], consumer).trim(), manifest.version);
    assert.match(run(binary, ["--help"], consumer), /Usage: coherent/);
  }
  const coherent = join(consumer, "node_modules", ".bin", "coherent");
  const installHelp = run(coherent, ["install", "--help"], consumer);
  assert.match(installHelp, /--providers/);
  assert.match(installHelp, /--scope/);
  assert.match(installHelp, /--yes/);
  assert.match(installHelp, /--skills-only/);
  assert.match(installHelp, /github:sethmgibson\/coherent/);
  assert.doesNotMatch(installHelp, /npx coherent install/);
  const versionReport = JSON.parse(run(coherent, ["version", consumer, "--json"], consumer)) as {
    runtime: {
      coherentVersion: string;
      workflowRevision: number;
      detectorRevision: number;
      capabilities: unknown;
      packageRoot: string;
      skillPath: string;
    };
    compatible: boolean;
    issues: unknown;
  };
  const { runtime } = versionReport;
  assert.equal(versionReport.compatible, true);
  assert.deepEqual(versionReport.issues, []);
  assert.equal(runtime.coherentVersion, manifest.version);
  assert.equal(runtime.workflowRevision, 2);
  assert.equal(runtime.detectorRevision, 10);
  assert(Array.isArray(runtime.capabilities) && runtime.capabilities.includes("python-ast"));
  assert.equal(
    await realpath(join(installed, "python", "analyze.py")).then((path) => path.endsWith("analyze.py")),
    true,
  );
  assert.equal(await realpath(runtime.packageRoot), installed);
  assert.equal(
    await realpath(runtime.skillPath),
    await realpath(join(installed, "skills", "coherent", "SKILL.md")),
  );
  const target = join(temporaryRoot, "audit-target");
  await mkdir(join(target, "with space"), { recursive: true });
  await writeFile(join(target, "index.ts"), "export const answer = 42;\n");
  await writeFile(
    join(target, "with space", "mod.py"),
    "def after_return(flag: bool) -> int:\n    if flag:\n        return 1\n        return 2\n    return 0\n",
  );
  const audit = JSON.parse(run(coherent, ["audit", target, "--json"], consumer)) as {
    findings: Array<{ ruleId: string; identity: string; locations: Array<{ file: string }> }>;
    runtime?: { coherentVersion?: unknown; workflowRevision?: unknown };
  };
  assert(Array.isArray(audit.findings), "Installed CLI did not return findings JSON");
  assert.equal(audit.runtime?.coherentVersion, manifest.version);
  assert.equal(audit.runtime?.workflowRevision, 2);
  assert(
    audit.findings.some(
      (finding) =>
        finding.ruleId === "A08" &&
        finding.identity.includes("return 2") &&
        finding.locations.some((location) => location.file === "with space/mod.py"),
    ),
    "Packed CLI did not analyze a Python path containing spaces",
  );
  console.log("Installed CLI aliases, runtime identity, and audit passed.");

  const smoke = join(temporaryRoot, "smoke repo");
  const smokeHome = join(temporaryRoot, "smoke home");
  const stubDir = join(temporaryRoot, "pm-stub");
  await mkdir(smoke);
  await mkdir(smokeHome);
  await mkdir(stubDir);
  await writeFile(join(smoke, "package.json"), `${JSON.stringify({ name: "coherent-smoke", private: true }, null, 2)}\n`);
  run("git", ["init", "-b", "main"], smoke);
  const realNpm = spawnSync("which", ["npm"], { encoding: "utf8" });
  if (realNpm.status !== 0 || !realNpm.stdout.trim()) {
    throw new Error("npm is required for the packed install smoke");
  }
  await writeFile(
    join(stubDir, "npm"),
    `#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const args = process.argv.slice(2);
const tarball = process.env.COHERENT_PACKED_TARBALL;
const rewritten = args.map((arg) => (
  arg === "github:sethmgibson/coherent" && tarball ? tarball : arg
));
const result = spawnSync(process.env.COHERENT_REAL_NPM ?? "npm", rewritten, {
  stdio: "inherit",
  cwd: process.cwd(),
  env: process.env,
});
process.exit(result.status ?? 1);
`,
    "utf8",
  );
  await chmod(join(stubDir, "npm"), 0o755);
  const smokeEnv = {
    ...process.env,
    HOME: smokeHome,
    NODE_PATH: "",
    NODE_OPTIONS: "",
    PATH: `${stubDir}${delimiter}${process.env.PATH ?? ""}`,
    COHERENT_REAL_NPM: realNpm.stdout.trim(),
    COHERENT_PACKED_TARBALL: `file:${tarball}`,
  };
  const smokeResult = spawnSync("npm", [
    "exec", "--yes", "--package", tarball, "--",
    "coherent", "install", smoke, "--providers=codex,cursor", "--scope=project", "--yes",
  ], {
    cwd: smoke,
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 10 * 1024 * 1024,
    env: smokeEnv,
  });
  if (smokeResult.error || smokeResult.status !== 0) {
    throw new Error(
      `npm exec install smoke failed (${smokeResult.status ?? smokeResult.signal})\n${smokeResult.stdout}\n${smokeResult.stderr}`,
      { cause: smokeResult.error },
    );
  }
  assert.match(smokeResult.stdout, /\$coherent init|\/coherent init/);
  assert.match(smokeResult.stdout, /verified project-local CLI handshake/);
  assert.doesNotMatch(smokeResult.stdout, /add the CLI with/);
  const smokeSkill = join(smoke, ".agents", "skills", "coherent", "SKILL.md");
  const smokeTaxonomy = join(smoke, ".agents", "skills", "coherent", "reference", "taxonomy.md");
  const smokeCursor = join(smoke, ".cursor", "skills", "coherent", "SKILL.md");
  assert.match(await readFile(smokeSkill, "utf8"), /reference\/taxonomy\.md/);
  assert.match(await readFile(smokeTaxonomy, "utf8"), /A08/);
  assert.match(await readFile(smokeCursor, "utf8"), /name: coherent/);
  const smokeManifest = JSON.parse(await readFile(join(smoke, "package.json"), "utf8")) as {
    devDependencies?: { coherent?: string };
  };
  assert.equal(typeof smokeManifest.devDependencies?.coherent, "string");
  await access(join(smoke, "node_modules", ".bin", "coherent"));
  const homeEntries = await readdir(smokeHome);
  assert.ok(
    homeEntries.every((name) => name === ".npm" || name === ".local" || name === "Library"),
    `smoke install wrote unexpected home entries: ${homeEntries.join(", ")}`,
  );
  console.log("Documented npm exec install smoke passed in an isolated Git repo.");

  await cp(join(repoRoot, "tests", "fixtures", "packed-package", "consumer.ts"), join(consumer, "consumer.ts"));
  await writeFile(join(consumer, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      skipLibCheck: false,
      noUncheckedIndexedAccess: true,
      exactOptionalPropertyTypes: true,
      verbatimModuleSyntax: true,
      types: [],
      outDir: "compiled",
    },
    include: ["consumer.ts"],
  }));
  // Only the compiler executable comes from the checkout. Imports and declarations
  // resolve from the isolated consumer, with no paths mapping or ambient dev types.
  run(process.execPath, [join(repoRoot, "node_modules", "typescript", "bin", "tsc"), "--project", "tsconfig.json"], consumer);
  run(process.execPath, ["compiled/consumer.js"], consumer);
  console.log("All four public exports passed strict typechecking and runtime assertions.");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
