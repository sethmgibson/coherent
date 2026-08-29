export interface DoctorIssue {
  code:
    | "stale-discovery"
    | "unfenced-architecture"
    | "missing-architecture"
    | "baseline-versions"
    | "baseline-absolute-root"
    | "duplicate-fingerprint"
    | "orphan-review"
    | "invalid-semantic-finding"
    | "invalid-reviews"
    | "missing-baseline"
    | "legacy-state-dir";
  message: string;
}

export interface DoctorResult {
  issues: DoctorIssue[];
  ok: boolean;
}
