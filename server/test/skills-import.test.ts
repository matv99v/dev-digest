import { describe, it, expect } from 'vitest';
import { parseSkillImport, ImportRejectedError } from '../src/modules/skills/import.js';
import { MAX_IMPORT_BODY_CHARS } from '../src/modules/skills/constants.js';

describe('parseSkillImport', () => {
  it('rejects anything that is not .md / .markdown', () => {
    expect(() => parseSkillImport('skill.zip', '# Hello')).toThrow(ImportRejectedError);
    expect(() => parseSkillImport('skill.txt', '# Hello')).toThrow(ImportRejectedError);
    expect(() => parseSkillImport('no-extension', '# Hello')).toThrow(ImportRejectedError);
  });

  it('accepts both .md and .markdown', () => {
    expect(() => parseSkillImport('skill.md', '# Hello\nBody.')).not.toThrow();
    expect(() => parseSkillImport('skill.markdown', '# Hello\nBody.')).not.toThrow();
  });

  it('reads name/description/type from frontmatter', () => {
    const content = [
      '---',
      'name: corner-case-checklist',
      'description: Checks that corner cases are covered.',
      'type: rubric',
      '---',
      '# Corner Case Checklist',
      '',
      'Body content here.',
    ].join('\n');

    const preview = parseSkillImport('corner-case-checklist.md', content);
    expect(preview.name).toBe('corner-case-checklist');
    expect(preview.description).toBe('Checks that corner cases are covered.');
    expect(preview.type).toBe('rubric');
    expect(preview.body).not.toContain('---');
    expect(preview.body).toContain('# Corner Case Checklist');
  });

  it('falls back to the first # heading when frontmatter has no name', () => {
    const preview = parseSkillImport('whatever.md', '# My Skill Title\n\nSome description text.');
    expect(preview.name).toBe('My Skill Title');
    expect(preview.description).toBe('Some description text.');
  });

  it('falls back to the filename when there is no frontmatter and no heading', () => {
    const preview = parseSkillImport('no-heading-here.md', 'Just a paragraph, no heading.');
    expect(preview.name).toBe('no-heading-here');
  });

  it('falls back to type "custom" when frontmatter type is missing or invalid', () => {
    expect(parseSkillImport('a.md', '# A\n\ndesc').type).toBe('custom');
    const withBadType = ['---', 'type: not-a-real-type', '---', '# A', '', 'desc'].join('\n');
    expect(parseSkillImport('a.md', withBadType).type).toBe('custom');
  });

  it('warns (but does not throw) when no description can be found', () => {
    const preview = parseSkillImport('heading-only.md', '# Just A Heading');
    expect(preview.description).toBe('');
    expect(preview.warnings.some((w) => /description/i.test(w))).toBe(true);
  });

  it('truncates an oversized body and warns', () => {
    const huge = 'a'.repeat(MAX_IMPORT_BODY_CHARS + 500);
    const preview = parseSkillImport('huge.md', huge);
    expect(preview.body.length).toBe(MAX_IMPORT_BODY_CHARS);
    expect(preview.warnings.some((w) => /truncated/i.test(w))).toBe(true);
  });

  it('never executes or persists anything — pure parsing only', () => {
    // Nothing to assert on I/O since there is none; this documents the
    // contract: the return value is the ENTIRE effect of this function.
    const preview = parseSkillImport('a.md', '# A\n\ndesc');
    expect(Object.keys(preview).sort()).toEqual(
      ['body', 'description', 'name', 'type', 'warnings'].sort(),
    );
  });
});
