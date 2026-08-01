/**
 * PR-list FINDINGS rollup (`modules/pulls/status.ts`) — the pure aggregation
 * behind the list's FINDINGS column. Like `sumCostByPr`, it is a helper so the
 * "what does one badge per PR mean" decision gets coverage independent of the
 * route's join.
 *
 * The rules it encodes: count across EVERY review on the PR, skip dismissed
 * findings, and leave a PR out of the map entirely when nothing is live so the
 * column renders "—" instead of three zeros.
 */
import { describe, it, expect } from 'vitest';
import { rollupSeveritiesByPr } from '../src/modules/pulls/status.js';

const live = (prId: string, severity: string) => ({ prId, severity, dismissedAt: null });

describe('rollupSeveritiesByPr', () => {
  it('tallies across every review on the PR, not just the newest', () => {
    // Three reviews of one PR — the rows arrive flattened from the join, so the
    // helper cannot (and must not) tell which review each finding came from.
    const counts = rollupSeveritiesByPr([
      live('pr-1', 'CRITICAL'),
      live('pr-1', 'WARNING'),
      live('pr-1', 'SUGGESTION'),
      live('pr-1', 'SUGGESTION'),
      live('pr-1', 'WARNING'),
    ]);
    expect(counts.get('pr-1')).toEqual({ critical: 1, warning: 2, suggestion: 2 });
  });

  it('keeps PRs separate', () => {
    const counts = rollupSeveritiesByPr([
      live('pr-1', 'CRITICAL'),
      live('pr-2', 'WARNING'),
      live('pr-1', 'CRITICAL'),
    ]);
    expect(counts.get('pr-1')).toEqual({ critical: 2, warning: 0, suggestion: 0 });
    expect(counts.get('pr-2')).toEqual({ critical: 0, warning: 1, suggestion: 0 });
  });

  it('skips dismissed findings — dismissing is the user resolving it', () => {
    const counts = rollupSeveritiesByPr([
      live('pr-1', 'CRITICAL'),
      { prId: 'pr-1', severity: 'CRITICAL', dismissedAt: new Date('2026-07-01') },
      { prId: 'pr-1', severity: 'WARNING', dismissedAt: new Date('2026-07-01') },
    ]);
    expect(counts.get('pr-1')).toEqual({ critical: 1, warning: 0, suggestion: 0 });
  });

  it('omits a PR whose findings are ALL dismissed, so the column reads "—" not 0/0/0', () => {
    const counts = rollupSeveritiesByPr([
      { prId: 'pr-1', severity: 'CRITICAL', dismissedAt: new Date('2026-07-01') },
      { prId: 'pr-1', severity: 'WARNING', dismissedAt: new Date('2026-07-02') },
    ]);
    expect(counts.has('pr-1')).toBe(false);
    expect(counts.get('pr-1')).toBeUndefined();
  });

  it('still counts ACCEPTED findings — accepting affirms the problem is real', () => {
    // Only `dismissed_at` is passed in precisely because accepting must not
    // clear the badge; the column tracks open problems, not unread ones.
    const counts = rollupSeveritiesByPr([live('pr-1', 'CRITICAL'), live('pr-1', 'WARNING')]);
    expect(counts.get('pr-1')).toEqual({ critical: 1, warning: 1, suggestion: 0 });
  });

  it('ignores rows with no PR id', () => {
    const counts = rollupSeveritiesByPr([
      { prId: null, severity: 'CRITICAL', dismissedAt: null },
      live('pr-1', 'WARNING'),
    ]);
    expect(counts.size).toBe(1);
    expect(counts.get('pr-1')).toEqual({ critical: 0, warning: 1, suggestion: 0 });
  });

  it('omits a PR whose findings all carry an unrecognised severity', () => {
    // `findings.severity` is plain text in the DB — only Zod constrains it — so a
    // stray value must not produce a badge that reads "0" at every severity.
    const counts = rollupSeveritiesByPr([live('pr-1', 'NOTICE')]);
    expect(counts.has('pr-1')).toBe(false);
  });

  it('is empty for no findings at all', () => {
    expect(rollupSeveritiesByPr([]).size).toBe(0);
  });
});
