import { resolve } from "node:path";
import type { Command } from "commander";
import { RULES_BY_ID } from "../catalog/rules.js";
import { renderReviewQueue, runReviewQueue, type ReviewQueueState } from "./queue.js";
import { parseReviewRequests, runReview, runReviewBatch, runReviewPrune } from "./run.js";
import type { ReviewApplyReceipt, ReviewDecision, ReviewLifecycle } from "./types.js";
import { renderRuntimeIdentity } from "../runtime.js";

export function registerReviewCommands(program: Command, readStdin: () => Promise<string>): void {
  const review = program
    .command("review")
    .description("Record a durable decision, preview a batch, or inspect the review queue");

  review
    .command("queue")
    .description("Read-only review queue with item-level unreviewed, deferred, and ready groups")
    .argument("[root]", "repository root", ".")
    .option("--json", "print the queue as JSON", false)
    .option("--rule <id>", "limit to one rule ID")
    .option("--state <state>", "unreviewed, deferred, ready, dismissed, or all", "all")
    .option("--limit <n>", "max items per group", (value) => Number.parseInt(value, 10), 8)
    .action(async (
      root: string,
      options: { json: boolean; rule?: string; state: string; limit: number },
    ) => {
      try {
        const queue = await runReviewQueue(resolve(root), {
          ...(options.rule ? { rule: options.rule } : {}),
          state: options.state as ReviewQueueState | "all",
          limit: options.limit,
        });
        if (options.json) console.log(JSON.stringify(queue, null, 2));
        else process.stdout.write(renderReviewQueue(queue));
      } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
      }
    });

  review
    .command("apply")
    .description("Atomically apply a JSON array of review decisions from stdin")
    .argument("[root]", "repository root", ".")
    .option("--dry-run", "validate and preview without writing", false)
    .option("--json", "print a receipt with targets, replacements, and persisted decisions", false)
    .action(async (root: string, options: { dryRun: boolean; json: boolean }) => {
      try {
        if (process.stdin.isTTY) {
          throw new Error("Review batch JSON is required on stdin.");
        }
        const requests = parseReviewRequests(JSON.parse(await readStdin()) as unknown);
        const result = await runReviewBatch(resolve(root), requests, { dryRun: options.dryRun });
        if (options.json) {
          console.log(JSON.stringify(result.receipt, null, 2));
          return;
        }
        process.stdout.write(renderReceipt(result.receipt));
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
    .option("--expires-at <iso>", "ISO date or timestamp when compatibility must be re-reviewed")
    .option("--removal-milestone <text>", "release, consumer migration, or condition permitting removal")
    .option("--not-compatibility", "classify an A07 signal as a reviewed false positive")
    .action(async (
      fingerprint: string,
      root: string,
      options: {
        reason: string;
        expiresAt?: string;
        removalMilestone?: string;
        notCompatibility?: true;
      },
    ) => {
      await printReview(root, "dismissed", fingerprint, options.reason, options);
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
    .option("--expires-at <iso>", "ISO date or timestamp when compatibility must be re-reviewed")
    .option("--removal-milestone <text>", "release, consumer migration, or condition permitting removal")
    .option("--missing-evidence <text>", "what evidence is still missing")
    .option("--reconsider-when <text>", "when or under what condition to reconsider")
    .action(async (
      fingerprint: string,
      root: string,
      options: {
        reason: string;
        expiresAt?: string;
        removalMilestone?: string;
        missingEvidence?: string;
        reconsiderWhen?: string;
      },
    ) => {
      await printReview(root, "deferred", fingerprint, options.reason, options);
    });

  review
    .command("prune")
    .description("Preview stale, expired, and orphaned reviews; remove them only with --write")
    .argument("[root]", "repository root", ".")
    .option("--write", "remove the reported stale, expired, and orphaned reviews", false)
    .action(async (root: string, options: { write: boolean }) => {
      try {
        const result = await runReviewPrune(resolve(root), options.write);
        const action = result.wrote ? "Removed" : "Would remove";
        console.log(`${action} ${result.removable.length} stale, expired, or orphaned review(s).`);
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
}

export function renderReceipt(receipt: ReviewApplyReceipt): string {
  const lines = [
    receipt.dryRun ? "Review apply dry-run" : "Review apply",
    renderRuntimeIdentity(receipt.runtime),
    `${receipt.reviews.length} decision(s)  wrote: ${receipt.wrote}`,
    `Path: ${receipt.decisionsPath}`,
  ];
  for (const target of receipt.targets) {
    lines.push(`  ${target.fingerprint}  ${target.ruleId}  ${target.identity}`);
  }
  for (const replacement of receipt.replacements) {
    lines.push(
      `  replaced ${replacement.fingerprint}: ${replacement.previousDecision} -> ${replacement.nextDecision}`,
    );
  }
  if (receipt.wrote) {
    lines.push(`Applied ${receipt.reviews.length} review decision(s).`);
    lines.push(`Wrote ${receipt.decisionsPath}`);
  } else if (receipt.dryRun) {
    lines.push("No write performed.");
  }
  return `${lines.join("\n")}\n`;
}

async function printReview(
  root: string,
  decision: ReviewDecision,
  fingerprint: string,
  reason: string,
  lifecycle: ReviewLifecycle = {},
): Promise<void> {
  try {
    const result = await runReview(resolve(root), decision, fingerprint, reason, lifecycle);
    console.log(
      `${decision} ${RULES_BY_ID[result.review.ruleId].title}: ${result.review.identity}\nWrote ${result.decisionsPath}`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
