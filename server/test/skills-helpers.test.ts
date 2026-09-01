import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { toSkillDto, parseImport } from '../src/modules/skills/helpers.js';
import { ValidationError } from '../src/platform/errors.js';
import { MAX_IMPORT_BYTES } from '../src/modules/skills/constants.js';

/**
 * Unit coverage for the skills module's pure row→DTO mapping and import-file
 * parsing. No DB, no app — parseImport operates purely on an in-memory buffer.
 */

describe('toSkillDto', () => {
  it('maps a persisted skill row to the public Skill DTO', () => {
    const row = {
      id: 's1',
      workspaceId: 'w1',
      name: 'no-then-chains',
      description: 'House rule: always use async/await instead of .then chains.',
      type: 'convention',
      source: 'extracted',
      body: '# No then-chains\nUse async/await.',
      enabled: true,
      version: 2,
      evidenceFiles: ['src/foo.ts'],
      createdAt: new Date('2026-01-01T00:00:00Z'),
    } as never;

    expect(toSkillDto(row)).toEqual({
      id: 's1',
      name: 'no-then-chains',
      description: 'House rule: always use async/await instead of .then chains.',
      type: 'convention',
      source: 'extracted',
      body: '# No then-chains\nUse async/await.',
      enabled: true,
      version: 2,
      evidence_files: ['src/foo.ts'],
    });
  });

  it('maps a null evidenceFiles column to null', () => {
    const row = {
      id: 's2',
      workspaceId: 'w1',
      name: 'pr-quality-rubric',
      description: 'Rubric for evaluating overall PR quality.',
      type: 'rubric',
      source: 'manual',
      body: '# PR Quality Rubric',
      enabled: true,
      version: 1,
      evidenceFiles: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    } as never;

    expect(toSkillDto(row).evidence_files).toBeNull();
  });
});

describe('parseImport — .md', () => {
  it('preserves the body verbatim and extracts the name from the first heading', () => {
    const md = '# Uncovered Branches\n\nFlag any conditional with no test.\n';
    const preview = parseImport('uncovered-branches.md', Buffer.from(md, 'utf-8'));

    expect(preview.body).toBe(md);
    expect(preview.name).toBe('Uncovered Branches');
    expect(preview.type).toBe('custom');
    expect(preview.source).toBe('imported_url');
    expect(preview.ignored_files).toEqual([]);
  });

  it('falls back to the filename stem when there is no heading', () => {
    const md = 'Just some prose, no heading.\n';
    const preview = parseImport('no-then-chains.md', Buffer.from(md, 'utf-8'));

    expect(preview.name).toBe('no-then-chains');
  });

  it('falls back to the filename stem for a nested path too', () => {
    const md = 'No heading here either.\n';
    const preview = parseImport('skills/rules/my-skill.md', Buffer.from(md, 'utf-8'));

    expect(preview.name).toBe('my-skill');
  });
});

describe('parseImport — .zip', () => {
  it('resolves SKILL.md and lists an unrelated file as ignored, never reading it as content', () => {
    const zip = zipSync({
      'SKILL.md': strToU8('# Acme Rubric\n\nBody text.\n'),
      'setup.sh': strToU8('#!/bin/sh\necho pwned\n'),
    });
    const preview = parseImport('bundle.zip', Buffer.from(zip));

    expect(preview.name).toBe('Acme Rubric');
    expect(preview.body).toContain('Body text.');
    expect(preview.ignored_files).toEqual(['setup.sh']);
    expect(preview.source).toBe('imported_url');
  });

  it('is case-insensitive when resolving SKILL.md', () => {
    const zip = zipSync({
      'skill.md': strToU8('# lower-case skill file\n'),
    });
    const preview = parseImport('bundle.zip', Buffer.from(zip));

    expect(preview.name).toBe('lower-case skill file');
  });

  it('falls back to the first top-level *.md when there is no SKILL.md', () => {
    const zip = zipSync({
      'other.md': strToU8('# Other Skill\n'),
      'notes.txt': strToU8('not markdown\n'),
    });
    const preview = parseImport('bundle.zip', Buffer.from(zip));

    expect(preview.name).toBe('Other Skill');
    expect(preview.ignored_files).toEqual(['notes.txt']);
  });

  it('ignores a nested (non-top-level) .md when choosing the fallback', () => {
    const zip = zipSync({
      'nested/deep.md': strToU8('# Nested\n'),
    });

    expect(() => parseImport('bundle.zip', Buffer.from(zip))).toThrow(ValidationError);
  });

  it('throws ValidationError when the archive has no .md file at all', () => {
    const zip = zipSync({
      'readme.txt': strToU8('no markdown in this archive\n'),
    });

    expect(() => parseImport('bundle.zip', Buffer.from(zip))).toThrow(ValidationError);
    expect(() => parseImport('bundle.zip', Buffer.from(zip))).toThrow(/no \.md file/i);
  });
});

describe('parseImport — rejects', () => {
  it('throws ValidationError for an unsupported extension', () => {
    expect(() => parseImport('notes.txt', Buffer.from('hello'))).toThrow(ValidationError);
    expect(() => parseImport('notes.txt', Buffer.from('hello'))).toThrow(/unsupported file type/i);
  });

  it('throws ValidationError when the buffer exceeds MAX_IMPORT_BYTES', () => {
    const huge = Buffer.alloc(MAX_IMPORT_BYTES + 1, 'a');
    expect(() => parseImport('huge.md', huge)).toThrow(ValidationError);
    expect(() => parseImport('huge.md', huge)).toThrow(/too large/i);
  });

  it('accepts a buffer exactly at the size limit', () => {
    const atLimit = Buffer.alloc(MAX_IMPORT_BYTES, 'a');
    expect(() => parseImport('atlimit.md', atLimit)).not.toThrow();
  });
});
