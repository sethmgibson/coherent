import type { RuntimeIdentity } from "../runtime.js";
import type { DoctorValidationTarget } from "./snapshot.js";

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
    | "state-version-skew"
    | "legacy-state-dir";
  message: string;
}

export interface DoctorResult {
  runtime: RuntimeIdentity;
  target: DoctorValidationTarget;
  issues: DoctorIssue[];
  ok: boolean;
}
