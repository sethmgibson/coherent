import { RULES_BY_ID } from "../catalog/rules.js";
import { rescanReason, rescanRulesFor } from "../catalog/rescan.js";
import type { RuleId } from "../catalog/types.js";
import type { Finding } from "../domain/finding.js";
import { requiresAgentReview } from "../review/apply.js";
import type { FindingReview } from "../review/types.js";
import { groupFindings } from "./group.js";
import { scoreNode } from "./score.js";
import { deferralFields, nodeState } from "./state.js";
import type { CleanupNode, CleanupPlan, FindingGroup, PlanEdge } from "./types.js";
import { portableRuntimeIdentity } from "../runtime.js";

export function buildPlan(
  root: string,
  findings: Finding[],
  reviewState?: {
    needsReview?: ReadonlySet<string>;
    deferred?: ReadonlySet<string>;
    reviews?: readonly FindingReview[];
  },
): CleanupPlan {
  const groups = groupFindings(findings);
  const byFingerprint = new Map(findings.map((finding) => [finding.fingerprint, finding]));
  const needsReview =
    reviewState?.needsReview ??
    new Set(
      findings
        .filter(requiresAgentReview)
        .map((finding) => finding.fingerprint),
    );
  const deferred = reviewState?.deferred ?? new Set<string>();
  const reviewsByFingerprint = new Map(
    (reviewState?.reviews ?? []).map((review) => [review.fingerprint, review]),
  );
  const prereq = prerequisiteMap(groups, byFingerprint);
  const dependents = invert(prereq);
  const indirect = indirectMap(groups);

  const nodes: CleanupNode[] = groups.map((group) => {
    const groupFindings = fingerprintsOf(group, byFingerprint);
    const ruleIds = group.ruleIds;
    const phase = Math.min(...ruleIds.map((id) => RULES_BY_ID[id].defaultCleanupPhase));
    const confidence = worstConfidence(groupFindings);
    const status = groupFindings.every((finding) => finding.status === "confirmed")
      ? "confirmed"
      : "candidate";
    const rescanAfter = rescanRulesFor(ruleIds);
    const prerequisiteNodeIds = [...(prereq.get(group.id) ?? [])];
    return {
      id: group.id,
      title: nodeTitle(group, groupFindings),
      findingFingerprints: group.fingerprints,
      ruleIds,
      prerequisiteNodeIds,
      defaultPhase: phase as CleanupNode["defaultPhase"],
      reasonForOrdering: group.fingerprints.some((fingerprint) => needsReview.has(fingerprint))
        ? "Review required before cleanup. Static signals alone do not establish safe deletion."
        : group.fingerprints.every((fingerprint) => deferred.has(fingerprint))
          ? deferralFields(group.fingerprints, reviewsByFingerprint).deferralReason
            ?? "Deferred. Not selected by fix next until reconsidered."
          : orderingReason(group, prerequisiteNodeIds.length, rescanAfter),
      concepts: conceptsOf(groupFindings),
      likelyFiles: group.files,
      confidence,
      status,
      behavioralRisk: riskOf(groupFindings),
      expectedSimplification: simplificationOf(group, groupFindings),
      deletionPotential: deletionOf(groupFindings),
      unlocks: unlocksOf(groupFindings, group, rescanAfter, indirect.get(group.id) ?? []),
      ...deferralFields(group.fingerprints, reviewsByFingerprint),
      testSafetyEvidence: testEvidence(groupFindings),
      rescanAfter,
      mayResolveIndirectly: indirect.get(group.id) ?? [],
      priorityScore: 0,
      state: nodeState(group.fingerprints, prerequisiteNodeIds.length, needsReview, deferred),
    };
  });

  for (const [index, node] of nodes.entries()) {
    const group = groups[index]!;
    node.priorityScore = scoreNode({
      group,
      findings: fingerprintsOf(group, byFingerprint),
      prerequisiteCount: node.prerequisiteNodeIds.length,
      dependentCount: dependents.get(node.id)?.size ?? 0,
      rescanCount: node.rescanAfter.length,
      indirectCount: node.mayResolveIndirectly.length,
    });
  }

  nodes.sort((left, right) => right.priorityScore - left.priorityScore || left.id.localeCompare(right.id));

  const edges: PlanEdge[] = [];
  for (const node of nodes) {
    for (const parent of node.prerequisiteNodeIds) {
      edges.push({
        from: parent,
        to: node.id,
        reason: "Prerequisite cleanup should land first.",
      });
    }
  }

  const readyNodeIds = nodes.filter((node) => node.state === "ready").map((node) => node.id);
  const blockedNodeIds = nodes.filter((node) => node.state === "blocked").map((node) => node.id);
  const needsReviewNodeIds = nodes.filter((node) => node.state === "needs_review").map((node) => node.id);
  const deferredNodeIds = nodes.filter((node) => node.state === "deferred").map((node) => node.id);

  return {
    runtime: portableRuntimeIdentity(),
    generatedAt: new Date().toISOString(),
    root,
    terminalState: terminalState(
      nodes.length,
      readyNodeIds.length,
      needsReviewNodeIds.length,
      blockedNodeIds.length,
      deferredNodeIds.length,
    ),
    nodes,
    edges,
    readyNodeIds,
    blockedNodeIds,
    needsReviewNodeIds,
    deferredNodeIds,
    advisoryFindingCount: 0,
  };
}

function terminalState(
  nodeCount: number,
  ready: number,
  needsReview: number,
  blocked: number,
  deferred: number,
): CleanupPlan["terminalState"] {
  if (ready > 0) return "ready";
  if (needsReview > 0) return "awaiting_review";
  if (blocked > 0) return "blocked";
  if (deferred > 0) return "deferred_only";
  return nodeCount === 0 ? "clean" : "blocked";
}

function prerequisiteMap(
  groups: FindingGroup[],
  byFingerprint: Map<string, Finding>,
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const groupIdByFingerprint = new Map(
    groups.flatMap((group) =>
      group.fingerprints.map((fingerprint) => [fingerprint, group.id] as const),
    ),
  );
  for (const group of groups) {
    const prerequisites = new Set<string>();
    for (const finding of fingerprintsOf(group, byFingerprint)) {
      for (const prerequisiteFingerprint of finding.prerequisiteFindingIds) {
        const prerequisiteGroupId = groupIdByFingerprint.get(prerequisiteFingerprint);
        if (prerequisiteGroupId && prerequisiteGroupId !== group.id) {
          prerequisites.add(prerequisiteGroupId);
        }
      }
    }

    const needed = new Set<RuleId>();
    for (const ruleId of group.ruleIds) {
      for (const prerequisite of RULES_BY_ID[ruleId].prerequisites) {
        needed.add(prerequisite);
      }
    }
    if (needed.size > 0) {
      const files = new Set(group.files);
      const symbols = new Set(group.symbols);
      for (const other of groups) {
        if (other.id === group.id) continue;
        if (!other.ruleIds.some((id) => needed.has(id))) continue;
        const otherFindings = fingerprintsOf(other, byFingerprint);
        const analysisOnly = other.ruleIds.every((id) => RULES_BY_ID[id].workKind === "analysis");
        const overlaps =
          other.files.some((file) => files.has(file)) ||
          other.symbols.some((symbol) => symbols.has(symbol)) ||
          otherFindings.some((finding) => finding.authoritativeConcept && symbols.has(finding.authoritativeConcept));
        if (!overlaps && !analysisOnly) continue;
        if (!overlaps && analysisOnly && !sharesConcept(group, other, byFingerprint)) continue;
        prerequisites.add(other.id);
      }
    }
    if (prerequisites.size > 0) {
      map.set(group.id, prerequisites);
    }
  }
  return map;
}

function sharesConcept(
  left: FindingGroup,
  right: FindingGroup,
  byFingerprint: Map<string, Finding>,
): boolean {
  const concepts = new Set(
    fingerprintsOf(left, byFingerprint)
      .map((finding) => finding.authoritativeConcept)
      .filter((value): value is string => Boolean(value)),
  );
  return concepts.size > 0 && fingerprintsOf(right, byFingerprint).some((finding) =>
    finding.authoritativeConcept ? concepts.has(finding.authoritativeConcept) : false,
  );
}

function indirectMap(
  groups: FindingGroup[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const deleters = groups.filter((group) =>
    group.ruleIds.some((id) => id === "A08" || id === "A07" || id === "A04" || id === "A06"),
  );
  for (const deleter of deleters) {
    const files = new Set(deleter.files);
    const symbols = new Set(deleter.symbols);
    const resolved: string[] = [];
    for (const other of groups) {
      if (other.id === deleter.id) continue;
      if (other.ruleIds.some((id) => id === "A08" || id === "A07")) continue;
      const whollyCovered =
        other.files.length > 0 &&
        other.files.every((file) => files.has(file)) &&
        (other.symbols.length === 0 || other.symbols.every((symbol) => symbols.has(symbol)));
      if (whollyCovered) resolved.push(...other.fingerprints);
    }
    if (resolved.length > 0) map.set(deleter.id, unique(resolved));
  }
  return map;
}

function invert(prereq: Map<string, Set<string>>): Map<string, Set<string>> {
  const dependents = new Map<string, Set<string>>();
  for (const [child, parents] of prereq) {
    for (const parent of parents) {
      const list = dependents.get(parent) ?? new Set<string>();
      list.add(child);
      dependents.set(parent, list);
    }
  }
  return dependents;
}

function fingerprintsOf(group: FindingGroup, byFingerprint: Map<string, Finding>): Finding[] {
  return group.fingerprints
    .map((fingerprint) => byFingerprint.get(fingerprint))
    .filter((finding): finding is Finding => finding !== undefined);
}

function nodeTitle(group: FindingGroup, findings: Finding[]): string {
  const first = findings[0];
  if (!first) return group.id;
  if (findings.length === 1) return first.title;
  return `${first.title} (${findings.length} in ${group.files[0] ?? "multiple files"})`;
}

function orderingReason(group: FindingGroup, prereqs: number, rescan: RuleId[]): string {
  if (prereqs > 0) {
    return `Blocked on ${prereqs} prerequisite node(s). Default phase is a tie-break only.`;
  }
  if (group.ruleIds.includes("A08")) {
    return "Unlocked mechanical reduction. Removing dead code shrinks later reasoning.";
  }
  if (group.ruleIds.includes("A07")) {
    return "Unlocked compatibility review. Confirm no remaining consumers before deletion.";
  }
  if (rescan.length > 0) {
    return `Unlocked. ${rescanReason(group.ruleIds)}`;
  }
  return "Unlocked. Default phase used only because dependencies are equal.";
}

function conceptsOf(findings: Finding[]): string[] {
  return unique(
    findings.flatMap((finding) => [
      ...(finding.authoritativeConcept ? [finding.authoritativeConcept] : []),
      ...finding.affectedSymbols,
    ]),
  ).slice(0, 8);
}

function riskOf(findings: Finding[]): string {
  return unique(findings.map((finding) => finding.changeRisk).filter(Boolean)).join(" ") || "Needs review.";
}

function simplificationOf(group: FindingGroup, findings: Finding[]): string {
  if (group.ruleIds.includes("A08")) {
    if (findings.some((finding) => finding.status === "candidate")) {
      return "Verify reachability; remove only declarations proven unused after review.";
    }
    return `Remove ${findings.length} unused declaration(s) and shrink later analysis.`;
  }
  if (group.ruleIds.includes("A07")) {
    return "Remove a compatibility path after proving it has no consumers.";
  }
  return findings[0]?.cleanupBenefit ?? "Reduce conceptual surface.";
}

function deletionOf(findings: Finding[]): string {
  const confirmed = findings.filter((finding) => finding.status === "confirmed").length;
  if (confirmed === findings.length && findings.some((finding) => finding.ruleId === "A08")) {
    return "High — confirmed dead-code findings; verify runtime and public reachability before deletion.";
  }
  if (findings.some((finding) => finding.deletionOpportunity)) {
    return findings.find((finding) => finding.deletionOpportunity)?.deletionOpportunity ?? "";
  }
  return findings.every((finding) => finding.status === "candidate")
    ? "Uncertain until semantic review."
    : "Moderate.";
}

function unlocksOf(
  findings: Finding[],
  group: FindingGroup,
  rescan: RuleId[],
  indirect: string[],
): string {
  const parts = unique(
    findings
      .map((finding) => finding.unlocks)
      .filter((value): value is string => Boolean(value)),
  );
  const rescanText = rescanReason(group.ruleIds);
  if (rescan.length > 0 || parts.length === 0) {
    parts.push(rescanText);
  }
  if (indirect.length > 0) {
    parts.push(`${indirect.length} other finding(s) may disappear once this surface is gone.`);
  }
  return parts.join(" ");
}

function testEvidence(findings: Finding[]): string {
  const explicit = findings.map((finding) => finding.testSafetyEvidence).find(Boolean);
  if (explicit) return explicit;
  return "Inspect existing tests covering these files before editing.";
}

function worstConfidence(findings: Finding[]): Finding["confidence"] {
  if (findings.some((finding) => finding.confidence === "low")) return "low";
  if (findings.some((finding) => finding.confidence === "medium")) return "medium";
  return "high";
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
