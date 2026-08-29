#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Command } from "commander";
import { runInit, runRefresh } from "./init/run.js";
import { runAudit } from "./audit/run.js";
import { renderAudit } from "./audit/render.js";
import { runBaseline } from "./baseline/run.js";
import { renderCheck, runCheck } from "./check/run.js";
import { renderInstall, runInstall, runUpdate } from "./install/run.js";
import type { InstallOptions } from "./install/run.js";
import { runPlan } from "./plan/run.js";
import { renderPlan } from "./plan/render.js";
import { renderFixNext, runFixNext } from "./fix/run.js";
import { runDoctor } from "./doctor/run.js";
import { renderDoctor } from "./doctor/render.js";
import {
  parseReviewRequests,
  runReview,
  runReviewBatch,
  runReviewPrune,
} from "./review/run.js";
import type { ReviewDecision } from "./review/types.js";
import { RULES_BY_ID } from "./catalog/rules.js";

const program = new Command();

program
  .name("coherent")
  .description(
    "Maintainability tooling for backend and large AI-built codebases.",
  )
  .version("0.1.0");

program
  .command("init")
  .description("Inventory a repository and write .coherent/ARCHITECTURE.md")
  .argument("[root]", "repository root", ".")
  .option("--force", "overwrite an existing ARCHITECTURE.md", false)
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
      "Semantic sections in ARCHITECTURE.md still require human or agent completion. See /coherent init.",
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
  .option("--output <path>", "write JSON to an explicit path relative to the repository")
  .action(async (root: string, options: { json: boolean; output?: string }) => {
    const resolved = resolve(root);
    const result = await runAudit(resolved);
    if (options.json) {
      console.log(JSON.stringify(result.file, null, 2));
    } else {
      process.stdout.write(renderAudit(result));
    }
    if (options.output) {
      const path = resolve(resolved, options.output);
      await writeJsonOutput(path, result.file);
      console.log(`Wrote ${path}`);
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
  .description("Refresh only the explicitly selected optional integrations")
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
  .option("--output <path>", "write JSON to an explicit path relative to the repository")
  .action(async (root: string, options: { json: boolean; output?: string }) => {
    const resolved = resolve(root);
    const result = await runPlan(resolved);
    if (options.json) {
      console.log(JSON.stringify(result.plan, null, 2));
    } else {
      process.stdout.write(renderPlan(result.plan));
    }
    if (options.output) {
      const path = resolve(resolved, options.output);
      await writeJsonOutput(path, result.plan);
      console.log(`Wrote ${path}`);
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
    if (!result.node && result.plan.nodes.length > 0) process.exitCode = 1;
  });

program
  .command("doctor")
  .description("Check reviews, findings, baseline versions, and discovered architecture")
  .argument("[root]", "repository root", ".")
  .option("--json", "print the doctor report as JSON", false)
  .option("--deep", "run a full audit to verify orphan and stale reviews", false)
  .action(async (root: string, options: { json: boolean; deep: boolean }) => {
    try {
      const result = await runDoctor(resolve(root), { deep: options.deep });
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

const review = program
  .command("review")
  .description("Record a durable confirmed, dismissed, or deferred decision");

review
  .command("apply")
  .description("Atomically apply a JSON array of review decisions from stdin")
  .argument("[root]", "repository root", ".")
  .action(async (root: string) => {
    try {
      if (process.stdin.isTTY) {
        throw new Error("Review batch JSON is required on stdin.");
      }
      const raw = await readStdin();
      const requests = parseReviewRequests(JSON.parse(raw) as unknown);
      const result = await runReviewBatch(resolve(root), requests);
      console.log(`Applied ${result.reviews.length} review decision(s).\nWrote ${result.decisionsPath}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  });

review
  .command("dismiss")
  .description("Drop a finding from later plans")
  .argument("<fingerprint>", "finding fingerprint")
  .argument("[root]", "repository root", ".")
  .requiredOption("--reason <reason>", "why this decision")
  .action(async (fingerprint: string, root: string, options: { reason: string }) => {
    await printReview(root, "dismissed", fingerprint, options.reason);
  });

review
  .command("confirm")
  .description("Mark a hybrid or semantic finding as ready work")
  .argument("<fingerprint>", "finding fingerprint")
  .argument("[root]", "repository root", ".")
  .option("--reason <reason>", "why this decision")
  .action(async (fingerprint: string, root: string, options: { reason?: string }) => {
    await printReview(
      root,
      "confirmed",
      fingerprint,
      options.reason ?? "Confirmed during semantic review.",
    );
  });

review
  .command("defer")
  .description("Keep a finding visible but not ready")
  .argument("<fingerprint>", "finding fingerprint")
  .argument("[root]", "repository root", ".")
  .requiredOption("--reason <reason>", "why this decision")
  .action(async (fingerprint: string, root: string, options: { reason: string }) => {
    await printReview(root, "deferred", fingerprint, options.reason);
  });

review
  .command("prune")
  .description("Preview stale and orphaned reviews; remove them only with --write")
  .argument("[root]", "repository root", ".")
  .option("--write", "remove the reported stale and orphaned reviews", false)
  .action(async (root: string, options: { write: boolean }) => {
    try {
      const result = await runReviewPrune(resolve(root), options.write);
      const action = result.wrote ? "Removed" : "Would remove";
      console.log(`${action} ${result.removable.length} stale or orphaned review(s).`);
      for (const item of result.removable.slice(0, 12)) {
        console.log(`  ${item.ruleId} ${item.identity}`);
      }
      if (result.removable.length > 12) {
        console.log(`  … ${result.removable.length - 12} more`);
      }
      if (result.wrote) console.log(`Wrote ${result.decisionsPath}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  });

async function printReview(
  root: string,
  decision: ReviewDecision,
  fingerprint: string,
  reason: string,
): Promise<void> {
  try {
    const result = await runReview(resolve(root), decision, fingerprint, reason);
    console.log(
      `${decision} ${RULES_BY_ID[result.review.ruleId].title}: ${result.review.identity}\nWrote ${result.decisionsPath}`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

async function writeJsonOutput(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

await program.parseAsync(process.argv);
