export const RULE_IDS = [
  "A01",
  "A02",
  "A03",
  "A04",
  "A05",
  "A06",
  "A07",
  "A08",
  "B01",
  "B02",
  "B03",
  "B04",
  "B05",
  "B06",
  "C01",
  "C02",
  "C03",
  "C04",
  "C05",
  "D01",
  "D02",
  "D03",
  "D04",
  "D05",
  "E01",
  "E02",
  "E03",
  "E04",
  "E05",
  "E06",
] as const;

export type RuleId = (typeof RULE_IDS)[number];

export const CATEGORY_IDS = ["A", "B", "C", "D", "E"] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

export const PHASE_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;
export type PhaseId = (typeof PHASE_IDS)[number];

export const DETECTION_MODES = ["deterministic", "semantic", "hybrid"] as const;
export type DetectionMode = (typeof DETECTION_MODES)[number];

export const WORK_KINDS = ["analysis", "mutation", "both"] as const;
export type WorkKind = (typeof WORK_KINDS)[number];

export interface RuleCategory {
  id: CategoryId;
  title: string;
  summary: string;
}

export interface Rule {
  id: RuleId;
  slug: string;
  title: string;
  category: CategoryId;
  detectionMode: DetectionMode;
  description: string;
  whyItMatters: string;
  defaultCleanupPhase: PhaseId;
  workKind: WorkKind;
  prerequisites: readonly RuleId[];
  rescanAfter: readonly RuleId[];
}

export interface CleanupPhase {
  id: PhaseId;
  slug: string;
  title: string;
  summary: string;
  /** Default execution sequence. The same rule may appear more than once when a re-scan is required. */
  sequence: readonly RuleId[];
}
