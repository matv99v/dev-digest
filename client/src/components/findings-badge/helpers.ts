/** Ordering + shaping for the findings counters and their hover preview. */

import type { FindingRecord, PrFindingCounts } from "@devdigest/shared";
import type { Severity } from "@devdigest/ui";

/** Rendered when a PR has no live findings. Matches the COST column's "—". */
export const NO_DATA = "—";

/**
 * Severity ranking — worst first. Drives both the order of the counters in a
 * cell and which findings win the limited preview slots, so a CRITICAL is never
 * pushed out of the card by a pile of suggestions.
 *
 * `INFO` has no counter of its own (the server tallies only the three severities
 * the reviewer emits) but is ranked here because the PR-detail findings list
 * sorts with the same map.
 */
export const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
  INFO: 3,
};

/** How many findings the hover card previews before collapsing to "+N more". */
export const PREVIEW_LIMIT = 3;

/** The counters a cell renders, worst-first, with the zeroes dropped. */
export function countersOf(
  counts: PrFindingCounts | null | undefined,
): { severity: Severity; count: number }[] {
  if (!counts) return [];
  return (
    [
      { severity: "CRITICAL" as const, count: counts.critical },
      { severity: "WARNING" as const, count: counts.warning },
      { severity: "SUGGESTION" as const, count: counts.suggestion },
    ]
      // A zero of one severity is not information — showing "⚠ 0" next to a real
      // count reads as a second finding at a glance.
      .filter((c) => c.count > 0)
  );
}

export function totalOf(counts: PrFindingCounts | null | undefined): number {
  if (!counts) return 0;
  return counts.critical + counts.warning + counts.suggestion;
}

/**
 * Tally a list of findings into the same shape the list endpoint returns, so the
 * PR-detail timeline (which already holds full findings in memory) can drive the
 * identical counters without a round trip.
 *
 * Dismissed findings are skipped, matching the server's rollup — the two views
 * must never disagree about how many problems a run has.
 */
export function countsOfFindings(findings: FindingRecord[]): PrFindingCounts {
  const c: PrFindingCounts = { critical: 0, warning: 0, suggestion: 0 };
  for (const f of findings) {
    if (f.dismissed_at) continue;
    if (f.severity === "CRITICAL") c.critical += 1;
    else if (f.severity === "WARNING") c.warning += 1;
    else if (f.severity === "SUGGESTION") c.suggestion += 1;
  }
  return c;
}

/** Live findings, worst severity first — the preview order. */
export function sortBySeverity(findings: FindingRecord[]): FindingRecord[] {
  return [...findings]
    .filter((f) => !f.dismissed_at)
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));
}

/** "src/api/users.ts:46" or "src/api/users.ts:46-52". */
export function fileLabel(f: Pick<FindingRecord, "file" | "start_line" | "end_line">): string {
  const lines = f.end_line > f.start_line ? `${f.start_line}-${f.end_line}` : `${f.start_line}`;
  return `${f.file}:${lines}`;
}
