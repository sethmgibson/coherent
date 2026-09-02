#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Command } from "commander";
import { runInit, runRefresh } from "./init/run.js";
import { compactFindingsFile, runAudit } from "./audit/run.js";
import { renderAudit } from "./audit/render.js";
import { runBaseline } from "./baseline/run.js";
import { renderCheck, runCheck } from "./check/run.js";
import { renderInstall, runInstall, runUpdate } from "./install/run.js";
import type { InstallOptions } from "./install/run.js";
import { runPlan } from "./plan/run.js";
import { renderPlan } from "./plan/render.js";
import { renderFixNext, runFixNext } from "./fix/run.js";
import { inspectJson, renderInspect, runInspect } from "./inspect.js";
import { runDoctor } from "./doctor/run.js";
import { renderDoctor } from "./doctor/render.js";
import { registerReviewCommands } from "./review/cli.js";
import {
  checkRuntimeCompatibility,
  renderRuntimeDetails,
  runtimeIdentity,
} from "./runtime.js";
import { COHERENT_VERSION } from "./version.js";

const program = new Command();

program
  .name("coherent")
  .description(
    "Maintainability tooling for backend and large AI-built codebases.",
  )
  .version(COHERENT_VERSION);

program
  .command("version")
  .description("Report the exact Coherent runtime and verify skill compatibility")
  .argument("[root]", "target repository root used to inspect its lockfile", ".")
  .option("--json", "print runtime identity and compatibility as JSON", false)
  .option("--expect-workflow <revision>", "required workflow revision", parseIntegerOption)
  .option("--expect-detector <revision>", "required detector revision", parseIntegerOption)
  .option(
    "--require-capability <capabilities...>",
    "capabilities required by the active skill workflow",
  )
  .action(async (
    root: string,
    options: {
      json: boolean;
      expectWorkflow?: number;
      expectDetector?: number;
      requireCapability?: string[];
    },
  ) => {
    const runtime = await runtimeIdentity(resolve(root));
    const issues = checkRuntimeCompatibility(runtime, {
      workflowRevision: options.expectWorkflow ?? runtime.workflowRevision,
      detectorRevision: options.expectDetector ?? runtime.detectorRevision,
      capabilities: options.requireCapability ?? [],
    });
    if (options.json) {
      console.log(JSON.stringify({ runtime, compatible: issues.length === 0, issues }, null, 2));
    } else {
      process.stdout.write(`${renderRuntimeDetails(runtime)}\n`);
      process.stdout.write(
        issues.length === 0
          ? "Compatibility: OK\n"
          : `Compatibility: FAILED\n${issues.map((issue) => `  ${issue}`).join("\n")}\n`,
      );
    }
    if (issues.length > 0) process.exitCode = 1;
  });

program
  .command("init")
  .description("Inventory a repository and write .coherent/ARCHITECTURE.md")
  .argument("[root]", "repository root", ".")
  .option("--force", "refresh discovered sections while preserving semantic prose", false)
  .action(async (root: string, options: { force: boolean }) => {
    const resolved = resolve(root);
    const result = await runInit(resolved, { force: options.force });
    if (result.wroteArchitecture) {
      console.log(`Wrote ${result.architecturePath}`);
    } else {
      console.log(
        `Left existing ${result.architecturePath} unchanged. Pass --force or run \`coherent refresh\` to update discovered sections.`,
      );
    }
    if (result.legacyWarning) {
      console.log(result.legacyWarning);
    }
    console.log(
      `Discovered ${result.inventory.packages.length} package(s), ${result.inventory.frameworks.join(", ") || "no frameworks"}, ${result.inventory.fileCount} files.`,
    );
    console.log(
      "Review semantic sections using the Coherent skill's init workflow.",
    );
  });

program
  .command("refresh")
  .description("Update fenced discovered sections in ARCHITECTURE.md without overwriting semantic prose")
  .argument("[root]", "repository root", ".")
  .action(async (root: string) => {
    const result = await runRefresh(resolve(root));
    if (result.legacyWarning) {
      console.log(result.legacyWarning);
    }
    console.log(`Updated discovered sections in ${result.architecturePath}`);
    console.log(
      `Discovered ${result.inventory.packages.length} package(s), ${result.inventory.frameworks.join(", ") || "no frameworks"}, ${result.inventory.fileCount} files.`,
    );
  });

program
  .command("audit")
  .description("Scan a repository for maintainability findings")
  .argument("[root]", "repository root", ".")
  .option("--json", "print findings as JSON", false)
  .option("--compact-json", "print one review-focused copy of each finding as JSON", false)
  .option("--output <path>", "write JSON to an explicit path relative to the repository")
  .action(async (
    root: string,
    options: { json: boolean; compactJson: boolean; output?: string },
  ) => {
    if (options.json && options.compactJson) {
      console.error("Choose either --json or --compact-json, not both.");
      process.exitCode = 1;
      return;
    }
    const resolved = resolve(root);
    const result = await runAudit(resolved);
    const jsonOutput = options.compactJson
      ? compactFindingsFile(result.file)
      : result.file;
    if (options.compactJson) {
      console.log(JSON.stringify(jsonOutput));
    } else if (options.json) {
      console.log(JSON.stringify(jsonOutput, null, 2));
    } else {
      process.stdout.write(renderAudit(result));
    }
    if (options.output) {
      const path = resolve(resolved, options.output);
      await writeJsonOutput(path, jsonOutput, options.compactJson ? 0 : 2);
      console.error(`Wrote ${path}`);
    }
  });

program
  .command("baseline")
  .description("Snapshot current findings as a cleanup baseline")
  .argument("[root]", "repository root", ".")
  .action(async (root: string) => {
    const result = await runBaseline(resolve(root));
    process.stdout.write(renderAudit(result.audit));
    const action = result.wroteBaseline ? "Wrote" : "Left unchanged";
    console.log(`${action} ${result.baselinePath} (${result.baseline.findings.length} fingerprint(s)).`);
  });

program
  .command("inspect")
  .description("Audit once, build the reviewed plan, and show the next cleanup node")
  .argument("[root]", "repository root", ".")
  .option("--json", "print compact audit, plan, and next node as JSON", false)
  .option("--performance", "include advisory performance heuristics in the cleanup DAG", false)
  .action(async (root: string, options: { json: boolean; performance: boolean }) => {
    const result = await runInspect(resolve(root), { includeAdvisory: options.performance });
    if (options.json) {
      console.log(JSON.stringify(inspectJson(result), null, 2));
    } else {
      process.stdout.write(renderInspect(result));
    }
  });

program
  .command("check")
  .description("Compare a fresh audit against the committed baseline")
  .argument("[root]", "repository root", ".")
  .option("--json", "print the drift report as JSON", false)
  .option("--changed", "parse only git-diff files plus importers", false)
  .action(async (root: string, options: { json: boolean; changed: boolean }) => {
    try {
      const result = await runCheck(resolve(root), { changed: options.changed });
      if (options.json) {
        console.log(
          JSON.stringify(
            {
              runtime: result.runtime,
              gateStatus: result.gateStatus,
              driftStatus: result.driftStatus,
              reviewSummary: result.reviewSummary,
              new: result.newFindings,
              existing: result.existingFindings,
              resolved: result.resolvedFindings,
              failing: result.failing,
              newDebt: result.newDebt,
              conceptualHardness: result.conceptualHardness,
              exitCode: result.exitCode,
              scopedFiles: result.scopedFiles,
            },
            null,
            2,
          ),
        );
      } else {
        process.stdout.write(renderCheck(result));
      }
      process.exitCode = result.exitCode;
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  });

program
  .command("install")
  .description("Install only the explicitly selected optional integrations")
  .argument("[root]", "repository root", ".")
  .option("--adapter", "copy the Cursor skill adapter", false)
  .option("--alias", "copy the legacy /backend Cursor alias", false)
  .option("--rule", "install the Cursor prevention rule", false)
  .option("--cursor-hook", "register the Cursor check --changed hook", false)
  .option("--git-hook", "register the Git pre-commit check --changed hook", false)
  .action(async (root: string, options: InstallOptions) => {
    const result = await runInstall(resolve(root), options);
    process.stdout.write(renderInstall("Coherent install", result));
  });

program
  .command("update")
  .description("Refresh selected integrations only; this does not update the CLI package")
  .argument("[root]", "repository root", ".")
  .option("--adapter", "refresh the Cursor skill adapter", false)
  .option("--alias", "refresh the legacy /backend Cursor alias", false)
  .option("--rule", "refresh the Cursor prevention rule", false)
  .option("--cursor-hook", "refresh the Cursor check --changed hook", false)
  .option("--git-hook", "refresh the Git pre-commit check --changed hook", false)
  .action(async (root: string, options: InstallOptions) => {
    const result = await runUpdate(resolve(root), options);
    process.stdout.write(renderInstall("Coherent update", result));
  });

program
  .command("plan")
  .description("Build a cleanup DAG from current findings")
  .argument("[root]", "repository root", ".")
  .option("--json", "print the plan as JSON", false)
  .option("--performance", "include advisory performance heuristics in the cleanup DAG", false)
  .option("--output <path>", "write JSON to an explicit path relative to the repository")
  .action(async (root: string, options: { json: boolean; performance: boolean; output?: string }) => {
    const resolved = resolve(root);
    const result = await runPlan(resolved, { includeAdvisory: options.performance });
    if (options.json) {
      console.log(JSON.stringify(result.plan, null, 2));
    } else {
      process.stdout.write(renderPlan(result.plan));
    }
    if (options.output) {
      const path = resolve(resolved, options.output);
      await writeJsonOutput(path, result.plan);
      console.error(`Wrote ${path}`);
    }
  });

program
  .command("fix")
  .description("Bounded cleanup against the current plan")
  .command("next")
  .description("Select one unlocked cleanup node and print a work brief")
  .argument("[root]", "repository root", ".")
  .option("--json", "print the selected node and its finding evidence as JSON", false)
  .option("--performance", "include advisory performance heuristics in the cleanup DAG", false)
  .action(async (root: string, options: { json: boolean; performance: boolean }) => {
    const result = await runFixNext(resolve(root), { includeAdvisory: options.performance });
    if (options.json) {
      console.log(JSON.stringify({
        runtime: result.plan.runtime,
        terminalState: result.plan.terminalState,
        node: result.node ?? null,
        findings: result.findings,
        dirtyTargetFiles: result.dirtyTargetFiles,
        worktreeInspectionWarning: result.worktreeInspectionWarning,
        planReady: result.plan.readyNodeIds,
      }, null, 2));
    } else {
      process.stdout.write(renderFixNext(result));
    }
    if (!result.node && result.plan.nodes.length > 0) process.exitCode = 1;
  });

program
  .command("doctor")
  .description("Check reviews, findings, baseline versions, and discovered architecture")
  .argument("[root]", "repository root", ".")
  .option("--json", "print the doctor report as JSON", false)
  .option("--deep", "run a full audit to verify orphan and stale reviews", false)
  .option("--staged", "validate the exact Git index snapshot", false)
  .option("--ref <ref>", "validate the exact committed Git ref snapshot")
  .action(async (
    root: string,
    options: { json: boolean; deep: boolean; staged: boolean; ref?: string },
  ) => {
    try {
      const result = await runDoctor(resolve(root), {
        deep: options.deep,
        staged: options.staged,
        ...(options.ref ? { ref: options.ref } : {}),
      });
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        process.stdout.write(renderDoctor(result));
      }
      if (!result.ok) process.exitCode = 1;
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  });

registerReviewCommands(program, readStdin);

async function writeJsonOutput(path: string, value: unknown, space = 2): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, space)}\n`, "utf8");
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseIntegerOption(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || String(parsed) !== value) {
    throw new Error(`Expected an integer revision, received: ${value}`);
  }
  return parsed;
}

await program.parseAsync(process.argv);
