import type { PhaseId, RuleId } from "../catalog/types.js";
import type { Confidence, FindingStatus } from "../domain/finding.js";

export const NODE_STATES = ["ready", "blocked", "done"] as const;
export type NodeState = (typeof NODE_STATES)[number];

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
  generatedAt: string;
  root: string;
  nodes: CleanupNode[];
  edges: PlanEdge[];
  readyNodeIds: string[];
  blockedNodeIds: string[];
}

export interface FindingGroup {
  id: string;
  ruleIds: RuleId[];
  fingerprints: string[];
  files: string[];
  symbols: string[];
  reason: string;
}
