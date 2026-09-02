export const DETECTION_MODES = ["deterministic", "semantic", "hybrid"] as const;
export type DetectionMode = (typeof DETECTION_MODES)[number];

export const WORK_KINDS = ["analysis", "mutation", "both"] as const;
export type WorkKind = (typeof WORK_KINDS)[number];

export interface RuleDefinition<Category extends string = string> {
  id: string;
  slug: string;
  title: string;
  category: Category;
  detectionMode: DetectionMode;
  description: string;
  whyItMatters: string;
  defaultCleanupPhase: number;
  workKind: WorkKind;
  prerequisites: readonly string[];
  rescanAfter: readonly string[];
  /** Exclude this heuristic from the cleanup DAG unless performance work is requested. */
  advisoryByDefault?: true;
}
