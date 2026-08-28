#!/usr/bin/env node
import { resolve } from "node:path";
import { Command } from "commander";
import { runInit } from "./init/run.js";
import { runAudit } from "./audit/run.js";
import { renderAudit } from "./audit/render.js";
import { runBaseline } from "./baseline/run.js";
import { renderCheck, runCheck } from "./check/run.js";
import { runPlan } from "./plan/run.js";
import { renderPlan } from "./plan/render.js";
import { renderFixNext, runFixNext } from "./fix/run.js";

const program = new Command();

program
  .name("coherent")
  .description(
    "Maintainability tooling for backend and large AI-built codebases.",
  )
  .version("0.1.0");

program
  .command("init")
  .description("Inventory a repository and write .backend/ARCHITECTURE.md")
  .argument("[root]", "repository root", ".")
  .option("--force", "overwrite an existing ARCHITECTURE.md", false)
  .action(async (root: string, options: { force: boolean }) => {
    const resolved = resolve(root);
    const result = await runInit(resolved, { force: options.force });
    console.log(`Wrote ${result.inventoryPath}`);
    if (result.wroteArchitecture) {
      console.log(`Wrote ${result.architecturePath}`);
    } else {
      console.log(
        `Left existing ${result.architecturePath} unchanged. Pass --force to regenerate discovered sections.`,
      );
    }
    console.log(
      `Discovered ${result.inventory.packages.length} package(s), ${result.inventory.frameworks.join(", ") || "no frameworks"}, ${result.inventory.fileCount} files.`,
    );
    console.log(
      "Semantic sections in ARCHITECTURE.md still require human or agent completion. See /backend init.",
    );
  });

program
  .command("audit")
  .description("Scan a repository for maintainability findings")
  .argument("[root]", "repository root", ".")
  .option("--json", "print findings as JSON", false)
  .action(async (root: string, options: { json: boolean }) => {
    const result = await runAudit(resolve(root));
    if (options.json) {
      console.log(JSON.stringify(result.file, null, 2));
    } else {
      process.stdout.write(renderAudit(result));
      console.log(`Wrote ${result.findingsPath}`);
    }
  });

program
  .command("baseline")
  .description("Snapshot current findings as a cleanup baseline")
  .argument("[root]", "repository root", ".")
  .action(async (root: string) => {
    const result = await runBaseline(resolve(root));
    process.stdout.write(renderAudit(result.audit));
    console.log(
      `Wrote ${result.baselinePath} (${result.baseline.findings.length} fingerprint(s)).`,
    );
  });

program
  .command("check")
  .description("Compare a fresh audit against the committed baseline")
  .argument("[root]", "repository root", ".")
  .option("--json", "print the drift report as JSON", false)
  .action(async (root: string, options: { json: boolean }) => {
    try {
      const result = await runCheck(resolve(root));
      if (options.json) {
        console.log(
          JSON.stringify(
            {
              new: result.newFindings,
              existing: result.existingFindings,
              resolved: result.resolvedFindings,
              failing: result.failing,
              newDebt: result.newDebt,
              conceptualHardness: result.conceptualHardness,
              exitCode: result.exitCode,
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
  .command("plan")
  .description("Build a cleanup DAG from current findings")
  .argument("[root]", "repository root", ".")
  .option("--json", "print the plan as JSON", false)
  .action(async (root: string, options: { json: boolean }) => {
    const result = await runPlan(resolve(root));
    if (options.json) {
      console.log(JSON.stringify(result.plan, null, 2));
    } else {
      process.stdout.write(renderPlan(result.plan));
      console.log(`Wrote ${result.planPath}`);
    }
  });

program
  .command("fix")
  .description("Bounded cleanup against the current plan")
  .command("next")
  .description("Select one unlocked cleanup node and print a work brief")
  .argument("[root]", "repository root", ".")
  .option("--json", "print the selected node as JSON", false)
  .action(async (root: string, options: { json: boolean }) => {
    const result = await runFixNext(resolve(root));
    if (options.json) {
      console.log(JSON.stringify({ node: result.node ?? null, planReady: result.plan.readyNodeIds }, null, 2));
    } else {
      process.stdout.write(renderFixNext(result));
    }
    if (!result.node) process.exitCode = 1;
  });

await program.parseAsync(process.argv);
