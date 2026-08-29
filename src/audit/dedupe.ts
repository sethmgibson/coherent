import type { Finding, FindingEvidence, SourceLocation } from "../domain/finding.js";

export function mergeFindingsByFingerprint(findings: Finding[]): Finding[] {
  const byFingerprint = new Map<string, Finding>();
  for (const finding of findings) {
    const existing = byFingerprint.get(finding.fingerprint);
    byFingerprint.set(
      finding.fingerprint,
      existing ? mergeOccurrence(existing, finding) : finding,
    );
  }
  return [...byFingerprint.values()];
}

export function assertUniqueFingerprints(findings: Finding[]): void {
  const seen = new Set<string>();
  for (const finding of findings) {
    if (seen.has(finding.fingerprint)) {
      throw new Error(
        `Duplicate finding fingerprint ${finding.fingerprint} (${finding.ruleId} ${finding.identity})`,
      );
    }
    seen.add(finding.fingerprint);
  }
}

function mergeOccurrence(left: Finding, right: Finding): Finding {
  const count = occurrenceCount(left) + occurrenceCount(right);
  return {
    ...left,
    locations: uniqueLocations([...left.locations, ...right.locations]),
    affectedSymbols: unique([...left.affectedSymbols, ...right.affectedSymbols]),
    evidence: mergeEvidence(left.evidence, right.evidence, count),
  };
}

function mergeEvidence(
  left: FindingEvidence,
  right: FindingEvidence,
  count: number,
): FindingEvidence {
  const details = unique([
    ...stripOccurrence(left.details ?? []),
    ...stripOccurrence(right.details ?? []),
    `occurrences: ${count}`,
  ]);
  return { summary: left.summary, details };
}

function occurrenceCount(finding: Finding): number {
  const marked = finding.evidence.details?.find((line) => /^occurrences: \d+$/.test(line));
  if (!marked) return 1;
  return Number(marked.slice("occurrences: ".length));
}

function stripOccurrence(details: string[]): string[] {
  return details.filter((line) => !/^occurrences: \d+$/.test(line));
}

function uniqueLocations(locations: SourceLocation[]): SourceLocation[] {
  const seen = new Set<string>();
  const result: SourceLocation[] = [];
  for (const location of locations) {
    const key = `${location.file}:${location.line ?? ""}:${location.column ?? ""}:${location.symbol ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(location);
  }
  return result;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
