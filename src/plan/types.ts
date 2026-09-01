import type { PhaseId, RuleId } from "../catalog/types.js";
import type { Confidence, FindingStatus } from "../domain/finding.js";
import type { PortableRuntimeIdentity } from "../runtime.js";

export const NODE_STATES = ["ready", "blocked", "done", "needs_review", "deferred"] as const;
export type NodeState = (typeof NODE_STATES)[number];

export const TERMINAL_STATES = [
  "ready",
  "awaiting_review",
  "blocked",
  "deferred_only",
  "clean",
] as const;
export type TerminalState = (typeof TERMINAL_STATES)[number];

export interface CleanupNode {
  id: string;
  title: string;
  findingFingerprints: string[];
  ruleIds: RuleId[];
  prerequisiteNodeIds: string[];
  defaultPhase: PhaseId;
  reasonForOrdering: string;
  concepts: string[];
  likelyFiles: string[];
  confidence: Confidence;
  status: FindingStatus;
  behavioralRisk: string;
  expectedSimplification: string;
  deletionPotential: string;
  unlocks: string;
  deferralReason?: string;
  reconsiderWhen?: string;
  missingEvidence?: string;
  testSafetyEvidence: string;
  rescanAfter: RuleId[];
  mayResolveIndirectly: string[];
  priorityScore: number;
  state: NodeState;
}

export interface PlanEdge {
  from: string;
  to: string;
  reason: string;
}

export interface CleanupPlan {
  runtime: PortableRuntimeIdentity;
  generatedAt: string;
  root: string;
  terminalState: TerminalState;
  nodes: CleanupNode[];
  edges: PlanEdge[];
  readyNodeIds: string[];
  blockedNodeIds: string[];
  needsReviewNodeIds: string[];
  deferredNodeIds: string[];
  reviewSummary?: PlanReviewSummary;
}

export interface PlanReviewSummary {
  detected: number;
  dismissed: number;
  confirmed: number;
  deferred: number;
  awaitingReview: number;
  cleanupNodes: number;
}

export interface FindingGroup {
  id: string;
  ruleIds: RuleId[];
  fingerprints: string[];
  files: string[];
  symbols: string[];
  reason: string;
}
