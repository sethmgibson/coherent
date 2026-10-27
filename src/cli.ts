#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { Command } from "commander";
import { runMigration } from "./migrate.js";
import { runInit, runRefresh } from "./init/run.js";
import { collectEvidence } from "./audit/collect.js";
import { RULE_IDS, RULES_BY_ID } from "./catalog/rules.js";
import type { RuleId } from "./catalog/types.js";
import { compactFindingsFile, runAudit } from "./audit/run.js";
import { renderAudit } from "./audit/render.js";
import { runBaseline } from "./baseline/run.js";
import { renderCheck, runCheck } from "./check/run.js";
import { renderInstall, runInstall, runUpdate } from "./install/run.js";
import type { InstallOptions } from "./install/run.js";
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
      "Complete only the durable context justified by source evidence; no baseline or audit is required.",
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
  .option("--evidence", "collect source evidence without advanced state or planning", false)
  .option("--paths <paths...>", "repository-relative source files or directories (evidence only)")
  .option("--rules <rules...>", "selected rule IDs (evidence only)")
  .option("--output <path>", "write JSON to an explicit path relative to the repository")
  .action(async (
    root: string,
    options: { json: boolean; compactJson: boolean; output?: string; evidence: boolean; paths?: string[]; rules?: string[] },
  ) => {
    if (options.json && options.compactJson) {
      console.error("Choose either --json or --compact-json, not both.");
      process.exitCode = 1;
      return;
    }
    const resolved = resolve(root);
    if ((options.paths || options.rules) && !options.evidence) {
      console.error("--paths and --rules require --evidence; legacy audit output is unchanged.");
      process.exitCode = 1;
      return;
    }
    if (options.evidence) {
      try {
        const rules = options.rules ?? ["A06"];
        if (rules.some(rule => !(RULE_IDS as readonly string[]).includes(rule))) throw new Error("Unknown rule in --rules.");
        const result = await collectEvidence(resolved, {
          ...(options.paths ? { include: options.paths } : {}), rules: rules as RuleId[],
        });
        const observations = result.observations.map(item => ({
          ruleId: item.ruleId, title: item.title, identity: item.identity,
          confidence: item.confidence, detectionMode: item.detectionMode,
          explanation: item.explanation, evidence: item.evidence,
          locations: item.locations, affectedSymbols: item.affectedSymbols,
        }));
        const output = { runtime: await runtimeIdentity(resolved),
          scope: { paths: options.paths ?? ["."], rules, repositoryWide: !options.paths,
            limitation: "Source observations require agent interpretation. Scoped absence does not establish repository-wide reachability or cleanliness." },
          observations };
        const serialized = options.json || options.compactJson
          ? JSON.stringify(output, null, options.compactJson ? 0 : 2)
          : undefined;
        if (serialized !== undefined) console.log(serialized);
        else {
          console.log(`Source evidence: ${observations.length} observation(s). Agent interpretation required; no cleanup queue. Scope: ${(options.paths ?? ["."]).join(", ")}.`);
          for (const item of observations) console.log(`${RULES_BY_ID[item.ruleId].title}: ${item.evidence.summary}\n${item.locations.map(loc => `  ${loc.file}:${loc.line ?? "?"}`).join("\n")}`);
        }
        if (options.output) {
          const path = resolve(resolved, options.output);
          // Evidence files are pretty-printed even when stdout is compact.
          await writeJsonOutput(path, (!options.compactJson ? serialized : undefined)
            ?? JSON.stringify(output, null, 2));
          console.error(`Wrote ${path}`);
        }
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
      return;
    }
    const result = await runAudit(resolved);
    const jsonOutput = options.compactJson
      ? compactFindingsFile(result.file)
      : result.file;
    const serialized = options.compactJson || options.json
      ? JSON.stringify(jsonOutput, null, options.compactJson ? 0 : 2)
      : undefined;
    if (serialized !== undefined) {
      console.log(serialized);
    } else {
      process.stdout.write(renderAudit(result));
    }
    if (options.output) {
      const path = resolve(resolved, options.output);
      await writeJsonOutput(path, serialized ?? JSON.stringify(jsonOutput, null, 2));
      console.error(`Wrote ${path}`);
    }
  });

program
  .command("migrate")
  .description("Preview optional focused-context migration; preserve baseline and reviews")
  .argument("[root]", "repository root", ".")
  .option("--write", "convert managed architecture inventory sections", false)
  .option("--json", "print the migration preview as JSON", false)
  .action(async (root: string, options: { write: boolean; json: boolean }) => {
    try {
      const result = await runMigration(resolve(root), options.write);
      if (options.json) console.log(JSON.stringify(result, null, 2));
      else {
        console.log(`${result.wrote ? "Migrated" : "Preview"}: ${result.architecturePath}`);
        if (result.architecture) console.log(result.architecture.after);
        console.log(`${result.reviewsNeedingEvidence.length} historical review(s) lack source evidence. No decisions or baseline rewritten.`);
        console.log(result.message);
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
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

retiredSchedulerCommand(program.command("inspect"), "inspect");

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
  .description("Install Codex/Cursor skills and the project CLI; optional integrations stay explicit")
  .argument("[root]", "repository root", ".")
  .option("--providers <list>", "comma-separated harnesses: codex,cursor")
  .option("--scope <scope>", "install location: project or global")
  .option("-y, --yes", "non-interactive defaults (detected or both providers, project scope)", false)
  .option("--skills-only", "copy skill files without installing the project CLI", false)
  .option("--adapter", "copy the Cursor skill adapter", false)
  .option("--alias", "copy the legacy /backend Cursor alias", false)
  .option("--rule", "install the Cursor prevention rule", false)
  .option("--cursor-hook", "register the Cursor check --changed hook", false)
  .option("--git-hook", "register the Git pre-commit check --changed hook", false)
  .addHelpText(
    "after",
    "\nThe unscoped npm name \"coherent\" is a different package. From GitHub:\n\n  npx --yes --package github:sethmgibson/coherent -- coherent install\n  npm exec --yes --package github:sethmgibson/coherent -- coherent install\n",
  )
  .action(async (root: string, options: InstallOptions) => {
    try {
      const result = await runInstall(resolve(root), {
        ...options,
        home: process.env.HOME ?? homedir(),
        interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
      });
      process.stdout.write(renderInstall("Coherent install", result));
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  });

program
  .command("update")
  .description("Refresh selected integrations only; this does not update the CLI package")
  .argument("[root]", "repository root", ".")
  .option("--providers <list>", "comma-separated harnesses: codex,cursor")
  .option("--scope <scope>", "install location: project or global")
  .option("-y, --yes", "non-interactive defaults (detected or both providers, project scope)", false)
  .option("--adapter", "refresh the Cursor skill adapter", false)
  .option("--alias", "refresh the legacy /backend Cursor alias", false)
  .option("--rule", "refresh the Cursor prevention rule", false)
  .option("--cursor-hook", "refresh the Cursor check --changed hook", false)
  .option("--git-hook", "refresh the Git pre-commit check --changed hook", false)
  .action(async (root: string, options: InstallOptions) => {
    try {
      const result = await runUpdate(resolve(root), {
        ...options,
        home: process.env.HOME ?? homedir(),
        interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
      });
      process.stdout.write(renderInstall("Coherent update", result));
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  });

retiredSchedulerCommand(
  program.command("plan").option("--output <path>", "legacy option; no file is written"),
  "plan",
);
retiredSchedulerCommand(program.command("fix").command("next"), "fix next");

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

function retiredSchedulerCommand(command: Command, name: string): void {
  command
    .description("Retired: cleanup sequencing belongs to the coding agent")
    .argument("[root]", "legacy repository argument; no source or state is read", ".")
    .option("--json", "print the retirement error as JSON", false)
    .option("--performance", "legacy option; no scheduling is performed", false)
    .action((_root: string, options: { json: boolean }) => {
      const message = `coherent ${name} is retired. The coding agent owns cleanup sequencing. Use audit --evidence for source observations, review queue for recorded judgments, and check for CI drift.`;
      if (options.json) {
        console.log(JSON.stringify({ error: { code: "scheduler_retired", command: name, message } }, null, 2));
      } else {
        console.error(message);
      }
      process.exitCode = 1;
    });
}

async function writeJsonOutput(path: string, serialized: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${serialized}\n`, "utf8");
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
