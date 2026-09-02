import { describe, it, expect } from 'vitest';
import {
  buildSkillDrafts,
  toConventionDto,
  verifyCandidates,
  type RawConventionCandidate,
} from '../src/modules/conventions/helpers.js';
import type { ConventionRow } from '../src/modules/conventions/repository.js';

/**
 * Unit coverage for the conventions module's pure logic — no DB/LLM/filesystem.
 * `verifyCandidates` is what stops a hallucinated file/line/snippet from ever
 * reaching persistence; `buildSkillDrafts` is what makes a rejected/pending
 * row structurally unable to reach a skill body.
 */

function candidate(over: Partial<RawConventionCandidate> = {}): RawConventionCandidate {
  return {
    rule: 'Always use async/await instead of .then() chains.',
    category: 'async-await',
    evidence_path: 'src/api/users.ts',
    evidence_line_start: 10,
    evidence_line_end: 10,
    evidence_snippet: 'const user = await db.users.find(id);',
    confidence: 0.8,
    ...over,
  };
}

const FILE_CONTENT = [
  'import { db } from "./db";',
  '',
  'export async function getUser(id: string) {',
  '  const user = await db.users.find(id);',
  '  return user;',
  '}',
].join('\n');

describe('verifyCandidates', () => {
  it('drops a candidate whose file was never sampled', () => {
    const { verified, droppedCount } = verifyCandidates(
      [candidate({ evidence_path: 'src/does/not/exist.ts' })],
      () => null,
    );
    expect(verified).toEqual([]);
    expect(droppedCount).toBe(1);
  });

  it('drops a candidate whose cited line range falls outside the file', () => {
    const { verified, droppedCount } = verifyCandidates(
      [candidate({ evidence_line_start: 100, evidence_line_end: 105 })],
      (path) => (path === 'src/api/users.ts' ? FILE_CONTENT : null),
    );
    expect(verified).toEqual([]);
    expect(droppedCount).toBe(1);
  });

  it('drops a candidate whose start line is before the range end (inverted range)', () => {
    const { verified, droppedCount } = verifyCandidates(
      [candidate({ evidence_line_start: 4, evidence_line_end: 3 })],
      (path) => (path === 'src/api/users.ts' ? FILE_CONTENT : null),
    );
    expect(verified).toEqual([]);
    expect(droppedCount).toBe(1);
  });

  it('drops a candidate whose snippet does not actually appear near the cited line', () => {
    const { verified, droppedCount } = verifyCandidates(
      [candidate({ evidence_line_start: 4, evidence_line_end: 4, evidence_snippet: 'this text is not in the file' })],
      (path) => (path === 'src/api/users.ts' ? FILE_CONTENT : null),
    );
    expect(verified).toEqual([]);
    expect(droppedCount).toBe(1);
  });

  it('keeps a candidate whose snippet matches exactly at the cited line', () => {
    const { verified, droppedCount } = verifyCandidates(
      [candidate({ evidence_line_start: 4, evidence_line_end: 4 })],
      (path) => (path === 'src/api/users.ts' ? FILE_CONTENT : null),
    );
    expect(droppedCount).toBe(0);
    expect(verified).toHaveLength(1);
    expect(verified[0]).toMatchObject({ evidence_line_start: 4, evidence_line_end: 4 });
  });

  it('snaps the cited range when the snippet is present but at a different offset within the slack window', () => {
    // Model cited line 3 (the function signature) but the snippet text is
    // actually on line 4 — within VERIFY_LINE_SLACK (3), so it should snap
    // rather than drop.
    const { verified, droppedCount } = verifyCandidates(
      [candidate({ evidence_line_start: 3, evidence_line_end: 3 })],
      (path) => (path === 'src/api/users.ts' ? FILE_CONTENT : null),
    );
    expect(droppedCount).toBe(0);
    expect(verified).toHaveLength(1);
    expect(verified[0]!.evidence_line_start).toBe(4);
    expect(verified[0]!.evidence_line_end).toBe(4);
  });

  it('matches after normalizing whitespace differences', () => {
    const { verified, droppedCount } = verifyCandidates(
      [
        candidate({
          evidence_line_start: 4,
          evidence_line_end: 4,
          evidence_snippet: '  const   user =   await db.users.find(id);  ',
        }),
      ],
      (path) => (path === 'src/api/users.ts' ? FILE_CONTENT : null),
    );
    expect(droppedCount).toBe(0);
    expect(verified).toHaveLength(1);
  });
});

function row(over: Partial<ConventionRow> = {}): ConventionRow {
  return {
    id: 'c1',
    workspaceId: 'w1',
    repoId: 'r1',
    rule: 'Always use async/await instead of .then() chains.',
    category: 'async-await',
    evidencePath: 'src/api/users.ts',
    evidenceSnippet: 'const user = await db.users.find(id);',
    evidenceLineStart: 4,
    evidenceLineEnd: 4,
    confidence: 0.8,
    status: 'accepted',
    scannedSha: 'a1b2c3d4',
    skillId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  } as ConventionRow;
}

describe('toConventionDto', () => {
  it('maps a persisted row to the public Convention DTO', () => {
    const dto = toConventionDto(row());
    expect(dto).toEqual({
      id: 'c1',
      repo_id: 'r1',
      category: 'async-await',
      rule: 'Always use async/await instead of .then() chains.',
      evidence: {
        path: 'src/api/users.ts',
        line_start: 4,
        line_end: 4,
        snippet: 'const user = await db.users.find(id);',
      },
      confidence: 0.8,
      status: 'accepted',
      skill_id: null,
      scanned_sha: 'a1b2c3d4',
      created_at: '2026-01-01T00:00:00.000Z',
    });
  });
});

describe('buildSkillDrafts', () => {
  const accepted1 = row({ id: 'c1', category: 'async-await', rule: 'Use async/await, never .then().', status: 'accepted' });
  const accepted2 = row({ id: 'c2', category: 'validation', rule: 'Validate request bodies with zod.', status: 'accepted' });
  const pending = row({ id: 'c3', category: 'async-await', rule: 'A pending rule.', status: 'pending' });
  const rejected = row({ id: 'c4', category: 'async-await', rule: 'A rejected rule.', status: 'rejected' });

  it('excludes rejected and pending rows even when passed in', () => {
    const drafts = buildSkillDrafts('payments-api', [accepted1, pending, rejected], 'merged');
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.convention_ids).toEqual(['c1']);
    expect(drafts[0]!.body).not.toContain('A pending rule.');
    expect(drafts[0]!.body).not.toContain('A rejected rule.');
  });

  it('returns [] when there are no accepted rows', () => {
    expect(buildSkillDrafts('payments-api', [pending, rejected], 'merged')).toEqual([]);
    expect(buildSkillDrafts('payments-api', [pending, rejected], 'per_category')).toEqual([]);
  });

  it('mode "merged" produces one draft named <repo>-conventions with every accepted row', () => {
    const drafts = buildSkillDrafts('payments-api', [accepted1, accepted2], 'merged');
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.name).toBe('payments-api-conventions');
    expect(drafts[0]!.type).toBe('convention');
    expect(drafts[0]!.convention_ids.sort()).toEqual(['c1', 'c2']);
    expect(drafts[0]!.body).toContain('Use async/await, never .then().');
    expect(drafts[0]!.body).toContain('Validate request bodies with zod.');
    expect(drafts[0]!.evidence_files).toEqual(['src/api/users.ts']);
  });

  it('mode "per_category" produces one draft per distinct category', () => {
    const drafts = buildSkillDrafts('payments-api', [accepted1, accepted2], 'per_category');
    expect(drafts).toHaveLength(2);
    const names = drafts.map((d) => d.name).sort();
    expect(names).toEqual(['payments-api-async-await-conventions', 'payments-api-validation-conventions']);

    const asyncDraft = drafts.find((d) => d.name.includes('async-await'))!;
    expect(asyncDraft.convention_ids).toEqual(['c1']);
    const validationDraft = drafts.find((d) => d.name.includes('validation'))!;
    expect(validationDraft.convention_ids).toEqual(['c2']);
  });
});
