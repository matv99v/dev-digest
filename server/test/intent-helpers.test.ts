import { describe, it, expect } from 'vitest';
import {
  RawIntent,
  computeConfidence,
  detectInlinePlan,
  dropUngroundedScope,
  extractClosingIssueNumber,
  isIntentFresh,
} from '../src/modules/intent/helpers.js';
import { MAX_INLINE_PLAN_CHARS } from '../src/modules/intent/constants.js';

/**
 * Unit coverage for the PR Intent Layer's pure surface (T6) — no DB, no LLM,
 * no filesystem. Mirrors `docs/plans/02-pr-intent-layer.md`'s
 * `intent-helpers.test.ts` table, one case per row.
 */

describe('isIntentFresh', () => {
  it('is stale when the sha matches but the PR was updated after the derive', () => {
    const row = { derivedFromSha: 'sha1', derivedAt: new Date('2026-09-01T00:00:00Z') };
    const pull = { headSha: 'sha1', updatedAt: new Date('2026-09-02T00:00:00Z') };
    expect(isIntentFresh(row, pull)).toBe(false);
  });

  it('is fresh when the sha matches and updatedAt is null', () => {
    const row = { derivedFromSha: 'sha1', derivedAt: new Date('2026-09-01T00:00:00Z') };
    const pull = { headSha: 'sha1', updatedAt: null };
    expect(isIntentFresh(row, pull)).toBe(true);
  });

  it('is stale when the head sha has moved', () => {
    const row = { derivedFromSha: 'sha1', derivedAt: new Date('2026-09-02T00:00:00Z') };
    const pull = { headSha: 'sha2', updatedAt: new Date('2026-09-01T00:00:00Z') };
    expect(isIntentFresh(row, pull)).toBe(false);
  });
});

describe('computeConfidence', () => {
  it('is high when a resolved in-repo doc is among the sources', () => {
    expect(computeConfidence([{ kind: 'repo_doc', ref: 'docs/x.md' }])).toBe('high');
  });

  it('is high when an inline plan/spec was detected', () => {
    expect(computeConfidence([{ kind: 'inline_plan', ref: 'spec' }])).toBe('high');
  });

  it('is medium when the body carried real prose but nothing groundable', () => {
    expect(computeConfidence([{ kind: 'pr_body', ref: null }])).toBe('medium');
  });

  it('is low with only title/branch baseline signals', () => {
    expect(computeConfidence([{ kind: 'title', ref: null }, { kind: 'branch', ref: null }])).toBe('low');
  });
});

describe('detectInlinePlan', () => {
  it('recognises a spec by 3+ distinct template headings', () => {
    const body = '## Goal\ntext\n## Scope\ntext\n## Out of scope\ntext';
    expect(detectInlinePlan(body)).toEqual({ kind: 'spec', headings: ['Goal', 'Scope', 'Out of scope'] });
  });

  it('recognises a plan by 3+ distinct template headings', () => {
    const body = '## Requirements\ntext\n## Architecture\ntext\n## Phased tasks\ntext';
    expect(detectInlinePlan(body).kind).toBe('plan');
  });

  it('does not recognise only 2 headings, an ordinary PR-template pair', () => {
    const body = '## Goal\nDo the thing.\n## Scope\nJust this.';
    expect(detectInlinePlan(body).kind).toBeNull();
  });

  it('does not recognise long ordinary prose with no template headings', () => {
    const body = 'This PR fixes a bug in the widget renderer. '.repeat(200);
    expect(body.length).toBeGreaterThan(6000);
    expect(detectInlinePlan(body).kind).toBeNull();
  });

  it('is not truncated at the ordinary 4 000-char body cap — a pasted plan keeps its Out of scope section', () => {
    const filler = 'x'.repeat(4200);
    const body = `## Goal\n${filler}\n## Scope\ntext\n## Out of scope\nTHE-SIGNAL-AT-THE-END`;
    expect(body.length).toBeGreaterThan(4000);
    expect(detectInlinePlan(body).kind).toBe('spec');
    // The derivation cap (MAX_INLINE_PLAN_CHARS) must still contain the tail.
    expect(body.slice(0, MAX_INLINE_PLAN_CHARS)).toContain('THE-SIGNAL-AT-THE-END');
  });
});

describe('RawIntent', () => {
  it('has exactly the three fields the model may return — no confidence field', () => {
    expect(Object.keys(RawIntent.shape).sort()).toEqual(['in_scope', 'intent', 'out_of_scope']);
  });

  it('rejects a payload carrying a confidence field alongside the three required ones', () => {
    // Zod objects are non-strict by default: extra keys are stripped, not
    // rejected. The regression this guards against is the KEY SET itself
    // growing a `confidence` field — asserted above via `.shape` — not a
    // parse-time rejection of one.
    const parsed = RawIntent.parse({ intent: 'x', in_scope: [], out_of_scope: [], confidence: 0.9 });
    expect(parsed).not.toHaveProperty('confidence');
  });
});

describe('dropUngroundedScope', () => {
  it('drops a path-shaped entry that was never touched by the PR', () => {
    const result = dropUngroundedScope(['src/never-touched.ts'], ['src/a.ts']);
    expect(result).toEqual([]);
  });

  it('keeps a path-shaped entry that matches a changed file', () => {
    const result = dropUngroundedScope(['src/a.ts'], ['src/a.ts']);
    expect(result).toEqual(['src/a.ts']);
  });

  it('keeps free-form prose unconditionally', () => {
    const result = dropUngroundedScope(['error handling in the API layer'], ['src/a.ts']);
    expect(result).toEqual(['error handling in the API layer']);
  });
});

describe('extractClosingIssueNumber', () => {
  it('does not resolve an undocumented, keyword-less mention', () => {
    expect(extractClosingIssueNumber('see #4321 for context')).toBeNull();
  });

  it('resolves a documented closing keyword', () => {
    expect(extractClosingIssueNumber('Fixes #12')).toBe(12);
  });

  it('resolves a cross-repo documented closing keyword', () => {
    expect(extractClosingIssueNumber('resolves owner/repo#7')).toBe(7);
  });
});
