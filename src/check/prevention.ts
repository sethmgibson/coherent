import type { RuleId } from "../catalog/types.js";

export interface DebtItem {
  ruleId: RuleId;
}

export interface NewDebt<T extends DebtItem = DebtItem> {
  kind: string;
  items: T[];
}

const DEBT_KINDS: { kind: string; rules: RuleId[] }[] = [
  { kind: "parallel implementation", rules: ["A04", "A05"] },
  { kind: "duplicate representation", rules: ["A06"] },
  { kind: "wrapper or extra layer", rules: ["B01", "B04"] },
  { kind: "compatibility path", rules: ["A07"] },
  { kind: "helper duplication", rules: ["B05"] },
  { kind: "downstream invariant patch", rules: ["C01"] },
  { kind: "new boolean mode", rules: ["C03"] },
  { kind: "context growth", rules: ["C04"] },
  { kind: "layer violation", rules: ["B06"] },
  { kind: "dependency overlap", rules: ["D01"] },
  { kind: "swallowed error", rules: ["D03"] },
  { kind: "query or complexity regression", rules: ["E01", "E06"] },
];

export function classifyNewDebt<T extends DebtItem>(newFindings: T[]): NewDebt<T>[] {
  return DEBT_KINDS
    .map((entry) => ({
      kind: entry.kind,
      items: newFindings.filter((item) => entry.rules.includes(item.ruleId)),
    }))
    .filter((entry) => entry.items.length > 0);
}

export function conceptualHardness<T extends DebtItem>(newFindings: T[], debt: NewDebt<T>[]): string {
  if (newFindings.length === 0) {
    return "No new actionable mechanical findings against the baseline. Semantic architecture changes still require review.";
  }
  if (debt.length === 0) {
    return "Unclear. There are new findings, but none match the usual new-debt shapes. Inspect the diff.";
  }
  const kinds = debt.map((entry) => entry.kind).join(", ");
  return `Possibly. New architecture debt of kind: ${kinds}. Inspect whether an existing concept should have absorbed the work.`;
}
