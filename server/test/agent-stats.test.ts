import { describe, it, expect } from 'vitest';
import {
  averageOf,
  costDelta,
  computeAcceptRate,
  findingsByCategory,
  bucketRunsByDay,
  bucketFindingsBySeverityWeek,
  toAgentRunHistoryDto,
} from '../src/modules/agents/helpers.js';

/**
 * Unit coverage for the agents module's Stats-tab pure bucketing/aggregation
 * helpers. No DB — everything here operates over plain row arrays so the
 * null-vs-zero and windowing rules are testable without Docker.
 */

describe('averageOf', () => {
  it('averages the non-null values', () => {
    expect(averageOf([1, 2, 3])).toBe(2);
  });

  it('ignores null and undefined entries', () => {
    expect(averageOf([2, null, 4, undefined])).toBe(3);
  });

  it('returns null when every value is null/undefined', () => {
    expect(averageOf([null, undefined])).toBeNull();
  });

  it('returns null for an empty array', () => {
    expect(averageOf([])).toBeNull();
  });
});

describe('costDelta', () => {
  it('is the current window average minus the prior window average', () => {
    expect(costDelta([0.06, 0.04], [0.1, 0.1])).toBeCloseTo(-0.05);
  });

  it('is null when the prior window has no priced runs', () => {
    expect(costDelta([0.05], [null, null])).toBeNull();
  });

  it('is null when the current window has no priced runs', () => {
    expect(costDelta([null], [0.05])).toBeNull();
  });
});

describe('computeAcceptRate', () => {
  it('is accepted / decided', () => {
    const rows = [
      { acceptedAt: new Date(), dismissedAt: null },
      { acceptedAt: new Date(), dismissedAt: null },
      { acceptedAt: null, dismissedAt: new Date() },
      { acceptedAt: null, dismissedAt: null },
    ];
    expect(computeAcceptRate(rows)).toBeCloseTo(2 / 3);
  });

  it('is null when nothing has been decided yet — never 0', () => {
    expect(computeAcceptRate([{ acceptedAt: null, dismissedAt: null }])).toBeNull();
    expect(computeAcceptRate([])).toBeNull();
  });
});

describe('findingsByCategory', () => {
  it('counts rows per category', () => {
    const rows = [{ category: 'security' }, { category: 'bug' }, { category: 'security' }];
    expect(findingsByCategory(rows)).toEqual({ security: 2, bug: 1 });
  });
});

describe('bucketRunsByDay', () => {
  const now = new Date('2026-06-15T12:00:00Z');

  it('puts today\'s run in the last bucket', () => {
    const buckets = bucketRunsByDay([{ ranAt: now }], 3, now);
    expect(buckets).toEqual([0, 0, 1]);
  });

  it('puts a run from N days ago N buckets back', () => {
    const twoDaysAgo = new Date('2026-06-13T09:00:00Z');
    const buckets = bucketRunsByDay([{ ranAt: twoDaysAgo }], 3, now);
    expect(buckets).toEqual([1, 0, 0]);
  });

  it('drops a run outside the window and skips a null ranAt', () => {
    const tenDaysAgo = new Date('2026-06-05T09:00:00Z');
    const buckets = bucketRunsByDay([{ ranAt: tenDaysAgo }, { ranAt: null }], 3, now);
    expect(buckets).toEqual([0, 0, 0]);
  });
});

describe('bucketFindingsBySeverityWeek', () => {
  const now = new Date('2026-06-15T12:00:00Z');

  it('sorts each finding into the correct weekly bucket by severity', () => {
    const buckets = bucketFindingsBySeverityWeek(
      [
        { severity: 'CRITICAL', reviewCreatedAt: now },
        { severity: 'WARNING', reviewCreatedAt: now },
        { severity: 'SUGGESTION', reviewCreatedAt: new Date('2026-06-01T00:00:00Z') },
      ],
      3,
      now,
    );
    expect(buckets).toHaveLength(3);
    expect(buckets[2]).toMatchObject({ critical: 1, warning: 1, suggestion: 0 });
    const totalSuggestions = buckets.reduce((sum, b) => sum + b.suggestion, 0);
    expect(totalSuggestions).toBe(1);
  });

  it('ignores an unrecognized severity and a null reviewCreatedAt', () => {
    const buckets = bucketFindingsBySeverityWeek(
      [
        { severity: 'INFO', reviewCreatedAt: now },
        { severity: 'CRITICAL', reviewCreatedAt: null },
      ],
      2,
      now,
    );
    for (const b of buckets) expect(b).toMatchObject({ critical: 0, warning: 0, suggestion: 0 });
  });
});

describe('toAgentRunHistoryDto', () => {
  it('maps a joined run/PR row to the public DTO', () => {
    const dto = toAgentRunHistoryDto({
      runId: 'r1',
      ranAt: new Date('2026-06-01T09:14:00Z'),
      repoId: 'repo1',
      prNumber: 482,
      tokensIn: 12000,
      tokensOut: 4000,
      costUsd: 0.06,
      durationMs: 6200,
      findingsCount: 3,
      source: 'ci',
      status: 'done',
    });
    expect(dto).toEqual({
      run_id: 'r1',
      ran_at: '2026-06-01T09:14:00.000Z',
      repo_id: 'repo1',
      pr_number: 482,
      tokens_in: 12000,
      tokens_out: 4000,
      cost_usd: 0.06,
      duration_ms: 6200,
      findings_count: 3,
      source: 'ci',
      status: 'done',
    });
  });

  it('falls back an unrecognized source to local', () => {
    const dto = toAgentRunHistoryDto({
      runId: 'r2',
      ranAt: null,
      repoId: null,
      prNumber: null,
      tokensIn: null,
      tokensOut: null,
      costUsd: null,
      durationMs: null,
      findingsCount: null,
      source: null,
      status: null,
    });
    expect(dto.source).toBe('local');
    expect(dto.ran_at).toBeNull();
  });
});
