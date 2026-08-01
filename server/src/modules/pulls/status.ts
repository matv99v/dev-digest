import type { PrStatus } from '@devdigest/shared';

/**
 * PR-list rollup helpers (pure — no DB / `this`, so they unit-test cleanly).
 *
 * The Pull Requests list shows, per PR: the latest review's SCORE, a FINDINGS
 * severity breakdown, and a review STATUS. The DB `status` column holds
 * GitHub's merge state (open/merged/closed); the review status
 * (needs_review / reviewed / stale) is DERIVED here for OPEN PRs from the
 * commit a review last ran against (`lastReviewedSha`) vs the PR head, plus age.
 */

/** Open PRs whose current head was reviewed but untouched this long read "stale". */
export const STALE_DAYS = 7;

export interface SeverityCounts {
  critical: number;
  warning: number;
  suggestion: number;
}

/** Tally finding severities (CRITICAL / WARNING / SUGGESTION) for one review. */
export function rollupSeverities(rows: { severity: string }[]): SeverityCounts {
  const c: SeverityCounts = { critical: 0, warning: 0, suggestion: 0 };
  for (const r of rows) {
    if (r.severity === 'CRITICAL') c.critical += 1;
    else if (r.severity === 'WARNING') c.warning += 1;
    else if (r.severity === 'SUGGESTION') c.suggestion += 1;
  }
  return c;
}

/**
 * Per-PR severity tally for the list's FINDINGS column. Like COST and unlike
 * SCORE, this sums across EVERY review on the PR rather than only the latest:
 * the column answers "what is wrong with this PR", and a re-run that surfaces a
 * new problem must not hide what an earlier agent already found.
 *
 * DISMISSED findings are skipped. Dismissing is the user saying "not a real
 * problem" — a dismissed finding is resolved, and letting it keep inflating the
 * badge would make the column impossible to drive to zero. Accepted findings
 * DO still count: accepting affirms the finding is real, so it stays on the
 * board until the code changes.
 *
 * A PR with no live findings is absent from the map, so the caller renders "—"
 * rather than three zeros — the same convention `sumCostByPr` uses below.
 */
export function rollupSeveritiesByPr(
  rows: { prId: string | null; severity: string; dismissedAt: Date | null }[],
): Map<string, SeverityCounts> {
  const byPr = new Map<string, { severity: string }[]>();
  for (const row of rows) {
    if (!row.prId || row.dismissedAt != null) continue;
    const bucket = byPr.get(row.prId);
    if (bucket) bucket.push(row);
    else byPr.set(row.prId, [row]);
  }
  const counts = new Map<string, SeverityCounts>();
  for (const [prId, bucket] of byPr) {
    const c = rollupSeverities(bucket);
    // An unrecognised severity tallies nowhere, so a PR whose only findings are
    // of an unknown severity would otherwise land as a bare 0/0/0 badge.
    if (c.critical + c.warning + c.suggestion > 0) counts.set(prId, c);
  }
  return counts;
}

/**
 * Total review spend per PR for the list's COST column — the sum of EVERY
 * completed run, not just the newest one. A PR is typically reviewed several
 * times (re-runs, multiple agents), so "what has reviewing this PR cost me"
 * is the only reading of a single cost figure that isn't misleading: showing
 * one run's cost under-reports a 7-run PR by roughly 7×.
 *
 * Runs with an unknown cost (unpriced model, or recorded before cost tracking)
 * are SKIPPED, not treated as poisoning the total — one unknown run must not
 * blank a PR that has demonstrably cost money. A PR with no priced run at all
 * is simply absent from the map, so the caller renders "—" rather than $0.00.
 */
export function sumCostByPr(rows: { prId: string | null; costUsd: number | null }[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!row.prId || row.costUsd == null) continue;
    totals.set(row.prId, (totals.get(row.prId) ?? 0) + row.costUsd);
  }
  return totals;
}

/**
 * Review-freshness status for the PR list. Merged/closed PRs keep their GitHub
 * merge state; open PRs map to:
 *  - `needs_review` — never reviewed, OR head moved since the last review
 *  - `stale`        — current head was reviewed but the PR is older than STALE_DAYS
 *  - `reviewed`     — current head reviewed and recent
 */
export function deriveReviewStatus(args: {
  /** DB `status` column = GitHub merge state (open/merged/closed). */
  ghStatus: string;
  lastReviewedSha: string | null;
  headSha: string;
  updatedAt: Date | null;
  now: number;
  staleDays?: number;
}): PrStatus {
  const { ghStatus, lastReviewedSha, headSha, updatedAt, now } = args;
  if (ghStatus === 'merged' || ghStatus === 'closed') return ghStatus as PrStatus;
  if (!lastReviewedSha || lastReviewedSha !== headSha) return 'needs_review';
  const staleMs = (args.staleDays ?? STALE_DAYS) * 86_400_000;
  if (updatedAt && now - updatedAt.getTime() > staleMs) return 'stale';
  return 'reviewed';
}
