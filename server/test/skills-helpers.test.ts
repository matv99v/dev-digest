import { describe, it, expect } from 'vitest';
import { toSkillDto, toSkillVersionDto, isBodyChange } from '../src/modules/skills/helpers.js';
import type { SkillRow, SkillVersionRow } from '../src/db/rows.js';

function skillRow(overrides: Partial<SkillRow> = {}): SkillRow {
  return {
    id: 'skill-1',
    workspaceId: 'ws-1',
    name: 'no-then-chains',
    description: 'Always use async/await instead of .then chains.',
    type: 'convention',
    source: 'manual',
    body: '# No Then Chains\n\nUse async/await.',
    enabled: true,
    version: 1,
    evidenceFiles: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('toSkillDto', () => {
  it('maps a DB row to the public Skill DTO', () => {
    const dto = toSkillDto(skillRow());
    expect(dto).toEqual({
      id: 'skill-1',
      name: 'no-then-chains',
      description: 'Always use async/await instead of .then chains.',
      type: 'convention',
      source: 'manual',
      body: '# No Then Chains\n\nUse async/await.',
      enabled: true,
      version: 1,
      evidence_files: null,
    });
  });

  it('coalesces a null evidenceFiles to null (not undefined)', () => {
    expect(toSkillDto(skillRow({ evidenceFiles: null })).evidence_files).toBeNull();
  });
});

describe('toSkillVersionDto', () => {
  it('maps a DB row to the public SkillVersion DTO, ISO-stamping created_at', () => {
    const row: SkillVersionRow = {
      skillId: 'skill-1',
      version: 2,
      body: 'new body',
      message: 'Tightened the rule',
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
    };
    expect(toSkillVersionDto(row)).toEqual({
      skill_id: 'skill-1',
      version: 2,
      body: 'new body',
      message: 'Tightened the rule',
      created_at: '2026-02-01T00:00:00.000Z',
    });
  });

  it('coalesces a null message to null', () => {
    const row: SkillVersionRow = {
      skillId: 'skill-1',
      version: 1,
      body: 'body',
      message: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    expect(toSkillVersionDto(row).message).toBeNull();
  });
});

describe('isBodyChange', () => {
  const existing = skillRow({ body: 'original body' });

  it('is false when body is not part of the patch', () => {
    expect(isBodyChange(existing, undefined)).toBe(false);
  });

  it('is false when the patch body equals the existing body', () => {
    expect(isBodyChange(existing, 'original body')).toBe(false);
  });

  it('is true when the patch body differs from the existing body', () => {
    expect(isBodyChange(existing, 'changed body')).toBe(true);
  });

  it('is true even for a whitespace-only change (exact string comparison)', () => {
    expect(isBodyChange(existing, 'original body ')).toBe(true);
  });
});
