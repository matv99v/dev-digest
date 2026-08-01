/**
 * PR-list COST rollup (`modules/pulls/status.ts`) — the pure aggregation behind
 * the list's COST column. It exists as a helper precisely so the "what does one
 * number per PR mean" decision gets coverage independent of the route's queries.
 *
 * The rule it encodes: a PR's cost is the SUM of every completed run, and an
 * unknown cost is skipped rather than allowed to blank the total.
 */
import { describe, it, expect } from 'vitest';
import { sumCostByPr } from '../src/modules/pulls/status.js';

describe('sumCostByPr', () => {
  it('totals every run on a PR, not just the newest', () => {
    // The real shape that exposed the original bug: seven cheap runs on one PR,
    // each individually below a tenth of a cent. Reporting only the newest
    // ($0.0006) under-reported the true spend by ~8x.
    const totals = sumCostByPr(
      [0.0006, 0.0005, 0.0006, 0.001, 0.0007, 0.0009, 0.0005].map((costUsd) => ({
        prId: 'pr-1',
        costUsd,
      })),
    );
    expect(totals.get('pr-1')).toBeCloseTo(0.0048, 6);
  });

  it('keeps PRs separate', () => {
    const totals = sumCostByPr([
      { prId: 'pr-1', costUsd: 0.001 },
      { prId: 'pr-2', costUsd: 0.004 },
      { prId: 'pr-1', costUsd: 0.002 },
    ]);
    expect(totals.get('pr-1')).toBeCloseTo(0.003, 6);
    expect(totals.get('pr-2')).toBeCloseTo(0.004, 6);
  });

  it('skips unpriced runs instead of blanking the PR total', () => {
    // One run with an unknown cost must not erase spend we DO know about —
    // otherwise a single unpriced model hides a PR that cost real money.
    const totals = sumCostByPr([
      { prId: 'pr-1', costUsd: 0.002 },
      { prId: 'pr-1', costUsd: null },
      { prId: 'pr-1', costUsd: 0.003 },
    ]);
    expect(totals.get('pr-1')).toBeCloseTo(0.005, 6);
  });

  it('omits a PR whose runs are ALL unpriced, so the column reads "—" not $0.00', () => {
    const totals = sumCostByPr([
      { prId: 'pr-1', costUsd: null },
      { prId: 'pr-1', costUsd: null },
    ]);
    expect(totals.has('pr-1')).toBe(false);
    expect(totals.get('pr-1')).toBeUndefined();
  });

  it('keeps a genuine zero distinct from unknown', () => {
    const totals = sumCostByPr([{ prId: 'pr-1', costUsd: 0 }]);
    expect(totals.get('pr-1')).toBe(0);
  });

  it('ignores rows with no PR id', () => {
    const totals = sumCostByPr([
      { prId: null, costUsd: 0.005 },
      { prId: 'pr-1', costUsd: 0.001 },
    ]);
    expect(totals.size).toBe(1);
    expect(totals.get('pr-1')).toBeCloseTo(0.001, 6);
  });

  it('is empty for no runs at all', () => {
    expect(sumCostByPr([]).size).toBe(0);
  });
});
