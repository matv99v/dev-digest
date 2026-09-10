/**
 * R6 — the two axes of `get_findings`, and the fact that they compose.
 *
 * The last two cases are the ones with teeth: `limit: 1` and
 * `offset: 1, limit: 1` must report the **same** total over the **same**
 * filtered set, because that is the only way a caller can page. An
 * implementation that windowed before filtering would still pass every other
 * case here.
 */
import { describe, expect, it } from 'vitest';
import { shapeFindings } from '../../src/shape/findings';
import type { FindingLite } from '../../src/api/types';

const RATIONALE_CRITICAL = 'SENTINEL_RATIONALE_the_query_is_built_by_string_concatenation';
const RATIONALE_WARNING = 'SENTINEL_RATIONALE_this_allocation_is_in_the_hot_path';
const SUGGESTION_CRITICAL = 'SENTINEL_SUGGESTION_use_a_parameterised_query';

const CRITICAL: FindingLite = {
  id: 'f-critical',
  severity: 'CRITICAL',
  category: 'security',
  title: 'SQL injection in the search handler',
  file: 'src/search.ts',
  start_line: 41,
  end_line: 44,
  rationale: RATIONALE_CRITICAL,
  suggestion: SUGGESTION_CRITICAL,
  confidence: 0.9,
};

const WARNING: FindingLite = {
  id: 'f-warning',
  severity: 'WARNING',
  category: 'perf',
  title: 'Array copied on every render',
  file: 'src/list.tsx',
  start_line: 12,
  end_line: 12,
  rationale: RATIONALE_WARNING,
  suggestion: null,
  confidence: 0.6,
};

const SUGGESTION: FindingLite = {
  id: 'f-suggestion',
  severity: 'SUGGESTION',
  category: 'style',
  title: 'Name reads as a boolean but holds a count',
  file: 'src/list.tsx',
  start_line: 30,
  end_line: 30,
  rationale: 'SENTINEL_RATIONALE_naming',
  suggestion: null,
  confidence: 0.3,
};

/** Order matters: case (v) asserts the *second* of these survives `offset: 1`. */
const ALL = [CRITICAL, WARNING, SUGGESTION];

describe('shapeFindings (R6)', () => {
  it('concise keeps the title and drops rationale and suggestion', () => {
    const shaped = shapeFindings(ALL, { detail: 'concise' });
    const serialized = JSON.stringify(shaped);

    expect(serialized).toContain(CRITICAL.title);
    expect(serialized).not.toContain(RATIONALE_CRITICAL);
    expect(serialized).not.toContain(SUGGESTION_CRITICAL);
    // The key itself is absent, not merely empty — nothing can leak it back.
    expect(shaped.findings[0]).not.toHaveProperty('rationale');
    expect(shaped.findings[0]).not.toHaveProperty('suggestion');
  });

  it('full adds rationale and suggestion back', () => {
    const shaped = shapeFindings(ALL, { detail: 'full' });
    const serialized = JSON.stringify(shaped);

    expect(serialized).toContain(CRITICAL.title);
    expect(serialized).toContain(RATIONALE_CRITICAL);
    expect(serialized).toContain(SUGGESTION_CRITICAL);
    // A finding with no fix proposal keeps the key, as null.
    expect(shaped.findings[1]).toMatchObject({ rationale: RATIONALE_WARNING, suggestion: null });
  });

  it('severity: [CRITICAL] drops the WARNING row and says so', () => {
    const shaped = shapeFindings(ALL, { severity: ['CRITICAL'] });

    expect(shaped.findings.map((f) => f.id)).toEqual(['f-critical']);
    expect(shaped.total_matching).toBe(1);
    expect(shaped.dropped_by_severity_filter).toBe(2);
    // The counts are over everything, so the caller can see what widening buys.
    expect(shaped.counts_by_severity).toEqual({ CRITICAL: 1, WARNING: 1, SUGGESTION: 1 });
    expect(shaped.widen_with).toContain('severity');
  });

  it('limit: 1 returns one finding and states how many were left behind', () => {
    const shaped = shapeFindings(ALL, { limit: 1 });

    expect(shaped.findings.map((f) => f.id)).toEqual(['f-critical']);
    expect(shaped.returned).toBe(1);
    expect(shaped.total_matching).toBe(3);
    expect(shaped.omitted_by_window).toBe(2);
    expect(shaped.next_offset).toBe(1);
    expect(shaped.widen_with).toContain('offset: 1');
  });

  it('offset: 1, limit: 1 returns the second of the same set, with the same total', () => {
    const firstPage = shapeFindings(ALL, { limit: 1 });
    const secondPage = shapeFindings(ALL, { offset: 1, limit: 1 });

    expect(secondPage.findings.map((f) => f.id)).toEqual(['f-warning']);
    expect(secondPage.offset).toBe(1);
    // The window moved; the set it is a window onto did not.
    expect(secondPage.total_matching).toBe(firstPage.total_matching);
    expect(secondPage.next_offset).toBe(2);

    // And the two axes compose: filtering first, then windowing, gives the
    // second *matching* finding rather than the second finding overall.
    const filteredPage = shapeFindings(ALL, {
      severity: ['WARNING', 'SUGGESTION'],
      offset: 1,
      limit: 1,
    });
    expect(filteredPage.findings.map((f) => f.id)).toEqual(['f-suggestion']);
    expect(filteredPage.total_matching).toBe(2);
  });
});
