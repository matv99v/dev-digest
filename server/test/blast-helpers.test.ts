import { describe, it, expect } from 'vitest';
import {
  buildExplainPrompt,
  buildReverseImpact,
  buildSummary,
  groupDownstream,
  isCallersTruncated,
  isSummaryFresh,
  mapStatus,
  toExplanation,
  toPrBlastRadius,
  type BlastResultLike,
} from '../src/modules/blast/helpers.js';

/**
 * Unit coverage for L04 Blast Radius's pure surface (T7/T10) — no DB, no LLM,
 * no filesystem. Mirrors `intent-helpers.test.ts`'s shape.
 */

describe('mapStatus (R5)', () => {
  it('full → indexed, no reason', () => {
    expect(mapStatus({ status: 'full' }, true)).toEqual({ status: 'indexed', reason: null });
  });

  it('partial → partial, reason names the incomplete index', () => {
    const result = mapStatus({ status: 'partial' }, true);
    expect(result.status).toBe('partial');
    expect(result.reason).toMatch(/partial|incomplete/i);
  });

  it('flag off → degraded, reason names the flag — even over a perfectly good full index', () => {
    const result = mapStatus({ status: 'full' }, false);
    expect(result.status).toBe('degraded');
    expect(result.reason).toMatch(/code intelligence|turned off|disabled/i);
  });

  it('never indexed → none, reason names it — status read off IndexState.status, not .degraded', () => {
    // Exactly what `RepoIntelService.getIndexState()` synthesises when no
    // persisted `repo_index_state` row exists: status 'degraded' with
    // degradedReason 'no_data'. A `.degraded` check alone can't tell this
    // apart from a real indexer failure — mapStatus must use degradedReason.
    const result = mapStatus({ status: 'degraded', degradedReason: 'no_data' }, true);
    expect(result.status).toBe('none');
    expect(result.reason).toMatch(/never|no.*index/i);
  });

  it('a real indexer failure (not no_data) stays degraded, not none', () => {
    const result = mapStatus({ status: 'degraded', degradedReason: 'index_failed' }, true);
    expect(result.status).toBe('degraded');
    expect(result.reason).toMatch(/fail/i);
  });

  it('a partial index carrying no .degraded flag is still read correctly (the documented trap)', () => {
    // repo-intel/repository.ts: "'partial' is still a working index — no
    // degraded flag." mapStatus takes `.status` only, so this input has no
    // `degradedReason` at all, matching a real IndexState for 'partial'.
    const result = mapStatus({ status: 'partial' }, true);
    expect(result.status).toBe('partial');
  });
});

describe('buildSummary (R14)', () => {
  it('is never worded as an all-clear on an empty map, but names the status', () => {
    const summary = buildSummary({ symbols: 0, callers: 0, endpoints: 0, crons: 0 }, 'none');
    expect(summary).toContain('none');
    expect(summary).not.toMatch(/no impact|safe|all.clear/i);
  });

  it('is never worded as an all-clear on a real, non-empty map either', () => {
    const summary = buildSummary({ symbols: 3, callers: 12, endpoints: 2, crons: 0 }, 'indexed');
    expect(summary).toContain('indexed');
    expect(summary).not.toMatch(/no impact|safe|all.clear/i);
    expect(summary).toContain('3 changed symbols');
    expect(summary).toContain('12 known callers');
  });
});

describe('groupDownstream', () => {
  it('attributes an endpoint to a symbol only via a caller file that actually carries it in factsByFile', () => {
    const changedSymbols = [{ file: 'src/a.ts', name: 'foo', kind: 'function' }];
    const callers = [
      { file: 'src/route.ts', symbol: 'handler', viaSymbol: 'foo', line: 10 },
      { file: 'src/other.ts', symbol: 'helper', viaSymbol: 'foo', line: 20 },
    ];
    const factsByFile = {
      'src/route.ts': { endpoints: ['GET /foo'], crons: [] },
      // src/other.ts carries no facts — must not leak GET /foo onto it.
    };

    const [group] = groupDownstream(changedSymbols, callers, factsByFile);

    expect(group?.symbol).toBe('foo');
    expect(group?.callers).toHaveLength(2);
    expect(group?.endpoints_affected).toEqual(['GET /foo']);
  });

  it('never pastes the flat whole-PR union onto every symbol', () => {
    const changedSymbols = [
      { file: 'src/a.ts', name: 'foo', kind: 'function' },
      { file: 'src/b.ts', name: 'bar', kind: 'function' },
    ];
    const callers = [
      { file: 'src/route-foo.ts', symbol: 'h1', viaSymbol: 'foo', line: 1 },
      { file: 'src/route-bar.ts', symbol: 'h2', viaSymbol: 'bar', line: 1 },
    ];
    const factsByFile = {
      'src/route-foo.ts': { endpoints: ['GET /foo'], crons: [] },
      'src/route-bar.ts': { endpoints: ['GET /bar'], crons: [] },
    };

    const groups = groupDownstream(changedSymbols, callers, factsByFile);
    const fooGroup = groups.find((g) => g.symbol === 'foo');
    const barGroup = groups.find((g) => g.symbol === 'bar');

    expect(fooGroup?.endpoints_affected).toEqual(['GET /foo']);
    expect(barGroup?.endpoints_affected).toEqual(['GET /bar']);
  });

  it('caps the number of symbol groups at maxSymbols', () => {
    const changedSymbols = [
      { file: 'a.ts', name: 'a', kind: 'function' },
      { file: 'b.ts', name: 'b', kind: 'function' },
      { file: 'c.ts', name: 'c', kind: 'function' },
    ];
    const groups = groupDownstream(changedSymbols, [], undefined, 2);
    expect(groups).toHaveLength(2);
  });
});

describe('buildReverseImpact', () => {
  it('every changed file gets an entry, even with no dependents', () => {
    const result = buildReverseImpact(['src/untouched.ts'], []);
    expect(result).toEqual([{ changed_file: 'src/untouched.ts', dependents: [] }]);
  });

  it('groups rows by root and passes via through unchanged', () => {
    const rows = [
      { root: 'src/a.ts', file: 'src/a.ts', depth: 1, via: 'src/a.ts', endpoints: [], crons: [] },
      { root: 'src/a.ts', file: 'src/deep.ts', depth: 2, via: 'src/a.ts', endpoints: ['GET /x'], crons: [] },
    ];
    const [entry] = buildReverseImpact(['src/a.ts'], rows);
    expect(entry?.changed_file).toBe('src/a.ts');
    expect(entry?.dependents).toEqual([
      { file: 'src/a.ts', depth: 1, via: 'src/a.ts', endpoints: [], crons: [] },
      { file: 'src/deep.ts', depth: 2, via: 'src/a.ts', endpoints: ['GET /x'], crons: [] },
    ]);
  });
});

describe('isCallersTruncated (R2)', () => {
  it('is true when any symbol was truncated', () => {
    expect(isCallersTruncated(['foo'])).toBe(true);
  });

  it('is false when nothing was truncated, including undefined', () => {
    expect(isCallersTruncated([])).toBe(false);
    expect(isCallersTruncated(undefined)).toBe(false);
  });
});

describe('toPrBlastRadius', () => {
  it('never masks a genuinely empty map as an all-clear (R14) and carries the index sha (R11)', () => {
    const blast: BlastResultLike = { changedSymbols: [], callers: [], truncatedSymbols: [] };
    const result = toPrBlastRadius({
      blast,
      reverseRows: [],
      changedFiles: [],
      indexedSha: 'idxsha123',
      mapped: { status: 'none', reason: 'never indexed' },
      summaryRow: undefined,
    });

    expect(result.status).toBe('none');
    expect(result.reason).toBe('never indexed');
    expect(result.indexed_sha).toBe('idxsha123');
    expect(result.callers_truncated).toBe(false);
    expect(result.explanation).toBeNull();
    expect(result.summary).not.toMatch(/no impact|safe|all.clear/i);
  });

  it('carries callers_truncated from BlastResult.truncatedSymbols, never from a MAX-count heuristic', () => {
    // Deliberately fewer than any "cap" count — a dedup collision can leave a
    // genuinely truncated symbol with FEWER callers than the per-symbol max,
    // so the only correct signal is the facade's own truncatedSymbols list.
    const blast: BlastResultLike = {
      changedSymbols: [{ file: 'a.ts', name: 'foo', kind: 'function' }],
      callers: [{ file: 'b.ts', symbol: 'x', viaSymbol: 'foo', line: 1 }],
      truncatedSymbols: ['foo'],
    };
    const result = toPrBlastRadius({
      blast,
      reverseRows: [],
      changedFiles: ['a.ts'],
      indexedSha: null,
      mapped: { status: 'indexed', reason: null },
      summaryRow: undefined,
    });

    expect(result.callers_truncated).toBe(true);
    expect(result.indexed_sha).toBeNull();
  });

  it('includes a cached explanation when a summary row is present', () => {
    const blast: BlastResultLike = { changedSymbols: [], callers: [] };
    const result = toPrBlastRadius({
      blast,
      reverseRows: [],
      changedFiles: [],
      indexedSha: 'sha',
      mapped: { status: 'indexed', reason: null },
      summaryRow: {
        prId: 'pr1',
        explanation: 'This PR touches a widely-called helper.',
        derivedFromSha: 'headsha',
        derivedFromIndexSha: 'sha',
        derivedAt: new Date('2026-09-01T00:00:00Z'),
        provider: 'openai',
        model: 'gpt-4.1',
      },
    });

    expect(result.explanation).toEqual({
      text: 'This PR touches a widely-called helper.',
      model: 'gpt-4.1',
      provider: 'openai',
      derived_at: '2026-09-01T00:00:00.000Z',
    });
  });
});

describe('toExplanation', () => {
  it('maps a persisted row to the wire shape', () => {
    const row = {
      prId: 'pr1',
      explanation: 'text',
      derivedFromSha: 'a',
      derivedFromIndexSha: 'b',
      derivedAt: new Date('2026-09-01T00:00:00Z'),
      provider: null,
      model: null,
    };
    expect(toExplanation(row)).toEqual({
      text: 'text',
      model: null,
      provider: null,
      derived_at: '2026-09-01T00:00:00.000Z',
    });
  });
});

describe('isSummaryFresh', () => {
  const row = { derivedFromSha: 'head1', derivedFromIndexSha: 'idx1' };

  it('is fresh when both shas match', () => {
    expect(isSummaryFresh(row, 'head1', 'idx1')).toBe(true);
  });

  it('is stale when the head sha moved', () => {
    expect(isSummaryFresh(row, 'head2', 'idx1')).toBe(false);
  });

  it('is stale when the index sha moved but the head did not — a reindex without a new push', () => {
    expect(isSummaryFresh(row, 'head1', 'idx2')).toBe(false);
  });
});

describe('buildExplainPrompt', () => {
  it('wraps repo-derived content as untrusted data', () => {
    const messages = buildExplainPrompt({
      prTitle: 'Add feature',
      status: 'indexed',
      reason: null,
      changedSymbols: [{ file: 'a.ts', name: 'foo', kind: 'function' }],
      downstream: [],
      reverse: [],
    });
    const user = messages.find((m) => m.role === 'user');
    expect(user?.content).toContain('<untrusted');
    expect(user?.content).toContain('foo');
  });

  it('never claims an endpoint is reached, only potentially affected', () => {
    const messages = buildExplainPrompt({
      prTitle: 'Add feature',
      status: 'indexed',
      reason: null,
      changedSymbols: [],
      downstream: [],
      reverse: [],
    });
    const system = messages.find((m) => m.role === 'system');
    expect(system?.content).toMatch(/potentially affected/i);
  });
});
