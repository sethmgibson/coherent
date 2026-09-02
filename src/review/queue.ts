import { resolve } from "node:path";
import { runAudit } from "../audit/run.js";
import type { Finding } from "../domain/finding.js";
import { findingReviewState, matchReview } from "./apply.js";
import { readDecisions } from "./store.js";
import type { FindingReview, ReviewDecision } from "./types.js";
import { reviewGroupKey, type ReviewQueueGroupBy } from "./group.js";
import { portableRuntimeIdentity, renderRuntimeIdentity, type PortableRuntimeIdentity } from "../runtime.js";
import { isAdvisoryRule } from "../catalog/rules.js";

export type ReviewQueueState = "unreviewed" | "deferred" | "ready" | "dismissed" | "advisory";

export interface ReviewQueueItem {
  state: ReviewQueueState;
  fingerprint: string;
  ruleId: Finding["ruleId"];
  identity: string;
  title: string;
  evidence: Finding["evidence"];
  locations: Finding["locations"];
  decision?: ReviewDecision;
  reason?: string;
  missingEvidence?: string;
  reconsiderWhen?: string;
  reviewGroupKey: string;
}

export interface ReviewQueueGroup {
  id: string;
  ruleId: Finding["ruleId"];
  state: ReviewQueueState;
  total: number;
  shown: number;
  truncated: boolean;
  groupBy: ReviewQueueGroupBy;
  items: ReviewQueueItem[];
}

export interface ReviewQueue {
  runtime: PortableRuntimeIdentity;
  groups: ReviewQueueGroup[];
  counts: Record<ReviewQueueState, number>;
}

export interface ReviewQueueOptions {
  rule?: string;
  state?: ReviewQueueState | "all";
  limit?: number;
  groupBy?: ReviewQueueGroupBy;
}

export async function runReviewQueue(
  root: string,
  options: ReviewQueueOptions = {},
): Promise<ReviewQueue> {
  const limit = options.limit ?? 8;
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error("review queue --limit must be a non-negative integer");
  }
  const resolved = resolve(root);
  const [audit, decisions] = await Promise.all([
    runAudit(resolved),
    readDecisions(resolved),
  ]);
  const findings = uniqueFindings([...audit.findings, ...decisions.findings]);
  const items = findings.map((finding) => toItem(finding, matchReview(finding, decisions.reviews, findings)));
  const filtered = items.filter((item) => {
    if (options.rule && item.ruleId !== options.rule) return false;
    if (options.state && options.state !== "all" && item.state !== options.state) return false;
    return true;
  });
  const groups = groupItems(filtered, limit, options.groupBy ?? "evidence");
  const counts = {
    unreviewed: items.filter((item) => item.state === "unreviewed").length,
    deferred: items.filter((item) => item.state === "deferred").length,
    ready: items.filter((item) => item.state === "ready").length,
    dismissed: items.filter((item) => item.state === "dismissed").length,
    advisory: items.filter((item) => item.state === "advisory").length,
  };
  return { runtime: portableRuntimeIdentity(), groups, counts };
}

export function renderReviewQueue(queue: ReviewQueue): string {
  const lines = [
    "Coherent review queue",
    renderRuntimeIdentity(queue.runtime),
    `Unreviewed: ${queue.counts.unreviewed}  Deferred: ${queue.counts.deferred}  Ready: ${queue.counts.ready}  Dismissed: ${queue.counts.dismissed}  Advisory: ${queue.counts.advisory}`,
    "",
  ];
  if (queue.groups.length === 0) {
    lines.push("No matching review items.");
    return `${lines.join("\n")}\n`;
  }
  for (const group of queue.groups) {
    const shown = group.truncated ? `; showing ${group.shown}` : "";
    lines.push(`${group.state.toUpperCase()}  ${group.ruleId}  ${group.total} item(s)${shown}`);
    lines.push(`  evidence group: ${group.id}`);
    for (const item of group.items) {
      lines.push(`  ${item.fingerprint}`);
      lines.push(`    ${item.title}  ${item.identity}`);
      lines.push(`    ${item.evidence.summary}`);
      for (const location of item.locations.slice(0, 3)) {
        lines.push(`    ${location.file}${location.symbol ? ` ${location.symbol}` : ""}`);
      }
      if (item.reason) lines.push(`    decision: ${item.decision} — ${item.reason}`);
      if (item.missingEvidence) lines.push(`    missing evidence: ${item.missingEvidence}`);
      if (item.reconsiderWhen) lines.push(`    reconsider when: ${item.reconsiderWhen}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function toItem(finding: Finding, review: FindingReview | undefined): ReviewQueueItem {
  return {
    state: review
      ? findingReviewState(finding, review)
      : isAdvisoryRule(finding.ruleId)
        ? "advisory"
        : findingReviewState(finding, review),
    fingerprint: finding.fingerprint,
    ruleId: finding.ruleId,
    identity: finding.identity,
    title: finding.title,
    evidence: finding.evidence,
    locations: finding.locations,
    reviewGroupKey: reviewGroupKey(finding),
    ...(review?.decision ? { decision: review.decision } : {}),
    ...(review?.reason ? { reason: review.reason } : {}),
    ...(review?.missingEvidence ? { missingEvidence: review.missingEvidence } : {}),
    ...(review?.reconsiderWhen ? { reconsiderWhen: review.reconsiderWhen } : {}),
  };
}

function groupItems(
  items: ReviewQueueItem[],
  limit: number,
  groupBy: ReviewQueueGroupBy,
): ReviewQueueGroup[] {
  const clusters = new Map<string, ReviewQueueItem[]>();
  for (const item of items) {
    const file = item.locations[0]?.file ?? "unknown";
    const key = groupBy === "rule"
      ? `${item.state}:${item.ruleId}`
      : groupBy === "file"
        ? `${item.state}:${item.ruleId}:${file}`
        : `${item.state}:${item.reviewGroupKey}`;
    const list = clusters.get(key) ?? [];
    list.push(item);
    clusters.set(key, list);
  }
  return [...clusters.entries()].map(([id, group]) => ({
    id,
    ruleId: group[0]!.ruleId,
    state: group[0]!.state,
    total: group.length,
    shown: Math.min(group.length, limit),
    truncated: group.length > limit,
    groupBy,
    items: group.slice(0, limit),
  })).sort((left, right) => left.id.localeCompare(right.id));
}

function uniqueFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    if (seen.has(finding.fingerprint)) return false;
    seen.add(finding.fingerprint);
    return true;
  });
}
