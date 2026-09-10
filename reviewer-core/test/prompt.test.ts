/**
 * assemblePrompt — PR description slot (the fix that was missing: the PR body
 * never reached the prompt). Pins rendering, omit-when-empty, untrusted-wrap,
 * truncation, and ordering (before the diff).
 */
import { describe, it, expect } from 'vitest';
import { assemblePrompt } from '../src/prompt.js';

function userOf(parts: Parameters<typeof assemblePrompt>[0]): string {
  const { messages } = assemblePrompt(parts);
  return messages[1]!.content;
}

function systemOf(parts: Parameters<typeof assemblePrompt>[0]): string {
  return assemblePrompt(parts).messages[0]!.content;
}

describe('assemblePrompt — shared injection guard (server + CI)', () => {
  const sys = systemOf({ system: 'AGENT-SYS', diff: 'DIFF' });

  it('appends the guard to the agent system prompt', () => {
    expect(sys.startsWith('AGENT-SYS')).toBe(true);
    expect(sys).toMatch(/<untrusted>.*DATA to be analyzed/s);
  });

  it('forbids "intentional/test/demo" claims from descoping the review', () => {
    // The defense that replaced the keyword sanitizer: a general, trusted,
    // language-agnostic rule — not text parsing of untrusted input.
    expect(sys).toMatch(/test fixture|intentional|demo/i);
    expect(sys).toMatch(/never reduce|never .*descope|REPORT it/i);
    expect(sys).toMatch(/any language/i);
  });
});

describe('assemblePrompt — ## PR description', () => {
  it('renders the section (untrusted-wrapped) before the diff when present', () => {
    const { messages, assembly } = assemblePrompt({
      system: 'sys',
      diff: 'DIFF',
      prDescription: 'Adds rate limiting to the public /api endpoints.',
    });
    const user = messages[1]!.content;
    expect(user).toContain('## PR description');
    expect(user).toContain('<untrusted source="pr-description">');
    expect(user).toContain('Adds rate limiting to the public /api endpoints.');
    expect(user.indexOf('## PR description')).toBeLessThan(user.indexOf('## Diff to review'));
    expect(assembly.pr_description).toContain('Adds rate limiting');
  });

  it('omits the section when prDescription is undefined or blank (no behaviour change)', () => {
    expect(userOf({ system: 'sys', diff: 'DIFF' })).not.toContain('## PR description');
    expect(assemblePrompt({ system: 'sys', diff: 'DIFF' }).assembly.pr_description ?? null).toBeNull();
    expect(userOf({ system: 'sys', diff: 'DIFF', prDescription: '   ' })).not.toContain(
      '## PR description',
    );
  });

  it('truncates a huge body to the 4k cap', () => {
    const { assembly } = assemblePrompt({
      system: 'sys',
      diff: 'D',
      prDescription: 'x'.repeat(10_000),
    });
    expect((assembly.pr_description as string).length).toBe(4000);
  });
});

describe('assemblePrompt — ## Intent (L03)', () => {
  it('renders the section (untrusted-wrapped) between PR description and Skills / rules, diff still last', () => {
    const { messages, assembly } = assemblePrompt({
      system: 'sys',
      diff: 'DIFF',
      prDescription: 'Adds rate limiting to the public /api endpoints.',
      intent: 'Add rate limiting to prevent abuse of public endpoints.',
      skills: ['Follow the security checklist.'],
    });
    const user = messages[1]!.content;
    expect(user).toContain('## Intent');
    expect(user).toContain('<untrusted source="intent">');
    expect(user).toContain('Add rate limiting to prevent abuse of public endpoints.');
    expect(user.indexOf('## PR description')).toBeLessThan(user.indexOf('## Intent'));
    expect(user.indexOf('## Intent')).toBeLessThan(user.indexOf('## Skills / rules'));
    expect(user.indexOf('## Skills / rules')).toBeLessThan(user.indexOf('## Diff to review'));
    expect(assembly.intent).toBe('Add rate limiting to prevent abuse of public endpoints.');
  });

  it('omits the section when intent is undefined (no stray heading), and assembly.intent is null', () => {
    const user = userOf({ system: 'sys', diff: 'DIFF' });
    expect(user).not.toContain('## Intent');
    expect(assemblePrompt({ system: 'sys', diff: 'DIFF' }).assembly.intent).toBeNull();
  });

  it('truncates the ## Intent section content to the 2k cap in the prompt text (assembly.intent stays raw/untruncated)', () => {
    const huge = 'x'.repeat(5_000);
    const { messages, assembly } = assemblePrompt({
      system: 'sys',
      diff: 'D',
      intent: huge,
    });
    const user = messages[1]!.content;
    const startMarker = '<untrusted source="intent">\n';
    const start = user.indexOf(startMarker) + startMarker.length;
    const end = user.indexOf('\n</untrusted>', start);
    const wrappedContent = user.slice(start, end);
    expect(wrappedContent.length).toBe(2000);
    // Deliberate: assembly.intent records the raw, untruncated value (unlike
    // pr_description, which stores the already-truncated string) — see prompt.ts.
    expect((assembly.intent as string).length).toBe(5000);
  });
});
