export interface DoctorIssue {
  code:
    | "stale-discovery"
    | "unfenced-architecture"
    | "missing-architecture"
    | "baseline-versions"
    | "invalid-baseline"
    | "baseline-absolute-root"
    | "duplicate-fingerprint"
    | "orphan-review"
    | "stale-review"
    | "missing-review-lifecycle"
    | "expired-review"
    | "invalid-decisions"
    | "legacy-state-dir";
  message: string;
}

export interface DoctorResult {
  issues: DoctorIssue[];
  ok: boolean;
}
