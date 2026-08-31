import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative } from "node:path";
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
  const target = join(temporaryRoot, "audit-target");
  await mkdir(target);
  await writeFile(join(target, "index.ts"), "export const answer = 42;\n");
  const coherent = join(consumer, "node_modules", ".bin", "coherent");
  const audit = JSON.parse(run(coherent, ["audit", target, "--json"], consumer)) as {
    findings: unknown;
  };
  assert(Array.isArray(audit.findings), "Installed CLI did not return findings JSON");
  console.log("Installed CLI aliases and audit passed.");

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
