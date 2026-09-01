import { resolve } from "node:path";
import { runAudit } from "../audit/run.js";
import type { Finding } from "../domain/finding.js";
import { matchReview, requiresAgentReview } from "./apply.js";
import { readDecisions } from "./store.js";
import type { FindingReview, ReviewDecision } from "./types.js";

export type ReviewQueueState = "unreviewed" | "deferred" | "ready" | "dismissed";

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
}

export interface ReviewQueueGroup {
  id: string;
  ruleId: Finding["ruleId"];
  state: ReviewQueueState;
  items: ReviewQueueItem[];
}

export interface ReviewQueue {
  groups: ReviewQueueGroup[];
  counts: Record<ReviewQueueState, number>;
}

export interface ReviewQueueOptions {
  rule?: string;
  state?: ReviewQueueState | "all";
  limit?: number;
}

export async function runReviewQueue(
  root: string,
  options: ReviewQueueOptions = {},
): Promise<ReviewQueue> {
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
  const groups = groupItems(filtered, options.limit ?? 8);
  const counts = {
    unreviewed: items.filter((item) => item.state === "unreviewed").length,
    deferred: items.filter((item) => item.state === "deferred").length,
    ready: items.filter((item) => item.state === "ready").length,
    dismissed: items.filter((item) => item.state === "dismissed").length,
  };
  return { groups, counts };
}

export function renderReviewQueue(queue: ReviewQueue): string {
  const lines = [
    "Coherent review queue",
    `Unreviewed: ${queue.counts.unreviewed}  Deferred: ${queue.counts.deferred}  Ready: ${queue.counts.ready}  Dismissed: ${queue.counts.dismissed}`,
    "",
  ];
  if (queue.groups.length === 0) {
    lines.push("No matching review items.");
    return `${lines.join("\n")}\n`;
  }
  for (const group of queue.groups) {
    lines.push(`${group.state.toUpperCase()}  ${group.ruleId}  ${group.items.length} item(s)`);
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
    state: itemState(finding, review),
    fingerprint: finding.fingerprint,
    ruleId: finding.ruleId,
    identity: finding.identity,
    title: finding.title,
    evidence: finding.evidence,
    locations: finding.locations,
    ...(review?.decision ? { decision: review.decision } : {}),
    ...(review?.reason ? { reason: review.reason } : {}),
    ...(review?.missingEvidence ? { missingEvidence: review.missingEvidence } : {}),
    ...(review?.reconsiderWhen ? { reconsiderWhen: review.reconsiderWhen } : {}),
  };
}

function itemState(finding: Finding, review: FindingReview | undefined): ReviewQueueState {
  if (review?.decision === "dismissed") return "dismissed";
  if (review?.decision === "deferred") return "deferred";
  if (review?.decision === "confirmed" || !requiresAgentReview(finding)) return "ready";
  return "unreviewed";
}

function groupItems(items: ReviewQueueItem[], limit: number): ReviewQueueGroup[] {
  const clusters = new Map<string, ReviewQueueItem[]>();
  for (const item of items) {
    const key = `${item.state}:${item.ruleId}`;
    const list = clusters.get(key) ?? [];
    list.push(item);
    clusters.set(key, list);
  }
  return [...clusters.entries()].map(([id, group]) => ({
    id,
    ruleId: group[0]!.ruleId,
    state: group[0]!.state,
    items: group.slice(0, limit),
  }));
}

function uniqueFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    if (seen.has(finding.fingerprint)) return false;
    seen.add(finding.fingerprint);
    return true;
  });
}
