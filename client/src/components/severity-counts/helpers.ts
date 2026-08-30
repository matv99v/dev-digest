import type { FindingRecord, Severity } from "@devdigest/shared";

export type SeverityCountMap = Record<Severity, number>;

/** Display order for the severity counters — worst first, matching SEVERITY_ORDER
    elsewhere (FindingsPanel/constants.ts) and the mockups. Note this is the
    3-value @devdigest/shared `Severity` (no INFO — that only exists in the UI
    token map, never in a real Finding). */
export const SEVERITY_KEYS: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

/** Rendered when a PR/run has no findings at all. */
export const NO_FINDINGS = "—";

/** Group a flat findings list into per-severity counts, zero-filled. */
export function countBySeverity(findings: FindingRecord[]): SeverityCountMap {
  const counts: SeverityCountMap = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) {
    if (f.severity === "CRITICAL" || f.severity === "WARNING" || f.severity === "SUGGESTION") {
      counts[f.severity]++;
    }
  }
  return counts;
}

/** Total across all severities — 0 renders as NO_FINDINGS. */
export function totalCount(counts: SeverityCountMap | null | undefined): number {
  if (!counts) return 0;
  return counts.CRITICAL + counts.WARNING + counts.SUGGESTION;
}
