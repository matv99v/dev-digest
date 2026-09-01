import { describe, it, expect } from 'vitest';
import { assemblePrompt } from '@devdigest/reviewer-core';
import { toSkillPromptBlocks } from '../src/modules/reviews/helpers.js';
import type { LinkedSkillRow } from '../src/modules/agents/repository.js';

/**
 * L02 — toSkillPromptBlocks: enabled linked skills → prompt blocks for
 * assemblePrompt's `skills` slot. No I/O; pure function of the linked-skill
 * rows the repository already returns in `order` ascending.
 */

function link(over: Partial<LinkedSkillRow['skill']> & { order?: number }): LinkedSkillRow {
  const { order = 0, ...skillOver } = over;
  return {
    order,
    skill: {
      id: 's1',
      workspaceId: 'w1',
      name: 'a-skill',
      description: '',
      type: 'custom',
      source: 'manual',
      body: 'BODY',
      enabled: true,
      version: 1,
      evidenceFiles: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      ...skillOver,
    } as never,
  };
}

describe('toSkillPromptBlocks', () => {
  it('preserves the order of the input array (caller/repository sorts, not this function)', () => {
    const links = [
      link({ name: 'third', body: 'THIRD' }),
      link({ name: 'first', body: 'FIRST' }),
      link({ name: 'second', body: 'SECOND' }),
    ];
    expect(toSkillPromptBlocks(links)).toEqual(['THIRD', 'FIRST', 'SECOND']);
  });

  it('drops a linked skill that is disabled', () => {
    const links = [
      link({ name: 'on', body: 'ON', enabled: true }),
      link({ name: 'off', body: 'OFF', enabled: false }),
    ];
    expect(toSkillPromptBlocks(links)).toEqual(['ON']);
  });

  it('injects a manual skill raw (no untrusted wrapper)', () => {
    const [block] = toSkillPromptBlocks([link({ source: 'manual', body: 'Flag then-chains.' })]);
    expect(block).toBe('Flag then-chains.');
    expect(block).not.toContain('<untrusted');
  });

  it('injects an extracted skill raw (no untrusted wrapper)', () => {
    const [block] = toSkillPromptBlocks([link({ source: 'extracted', body: 'House rule.' })]);
    expect(block).toBe('House rule.');
    expect(block).not.toContain('<untrusted');
  });

  it('wraps an imported_url skill as untrusted, naming the skill in the source label', () => {
    const [block] = toSkillPromptBlocks([
      link({ name: 'no-then-chains', source: 'imported_url', body: 'Use async/await.' }),
    ]);
    expect(block).toContain('<untrusted source="skill:no-then-chains">');
    expect(block).toContain('Use async/await.');
    expect(block).toContain('</untrusted>');
  });

  it('wraps a community skill as untrusted, naming the skill in the source label', () => {
    const [block] = toSkillPromptBlocks([
      link({ name: 'acme-rubric', source: 'community', body: 'Community body.' }),
    ]);
    expect(block).toContain('<untrusted source="skill:acme-rubric">');
    expect(block).toContain('Community body.');
  });

  it('returns an empty array for an empty input', () => {
    expect(toSkillPromptBlocks([])).toEqual([]);
  });
});

describe('toSkillPromptBlocks + assemblePrompt — no behaviour change when empty', () => {
  const COMMON = {
    system: 'You are a reviewer.',
    diff: '@@ -1 +1 @@\n+stripeKey',
    task: "Review PR #482 'rate limit'",
  } as const;

  it('an empty skills array produces a user message byte-identical to omitting skills entirely', () => {
    const withEmpty = assemblePrompt({ ...COMMON, skills: toSkillPromptBlocks([]) });
    const omitted = assemblePrompt({ ...COMMON });
    expect(withEmpty.messages[1]!.content).toBe(omitted.messages[1]!.content);
    expect(withEmpty.messages[1]!.content).not.toContain('## Skills / rules');
  });

  it('a non-empty result renders the ## Skills / rules section', () => {
    const blocks = toSkillPromptBlocks([link({ body: 'Rule body.' })]);
    const { messages } = assemblePrompt({ ...COMMON, skills: blocks });
    expect(messages[1]!.content).toContain('## Skills / rules\nRule body.');
  });
});
