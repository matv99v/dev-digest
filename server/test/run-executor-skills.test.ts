import { describe, it, expect } from 'vitest';
import { renderSkillBlocks } from '../src/modules/reviews/helpers.js';
import type { LinkedSkillRow } from '../src/modules/agents/repository.js';

function link(overrides: {
  name: string;
  body?: string;
  skillEnabled?: boolean;
  linkEnabled?: boolean;
  order?: number;
}): LinkedSkillRow {
  return {
    skill: {
      id: overrides.name,
      workspaceId: 'ws-1',
      name: overrides.name,
      description: '',
      type: 'convention',
      source: 'manual',
      body: overrides.body ?? `Body of ${overrides.name}`,
      enabled: overrides.skillEnabled ?? true,
      version: 1,
      evidenceFiles: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    order: overrides.order ?? 0,
    enabled: overrides.linkEnabled ?? true,
  };
}

describe('renderSkillBlocks', () => {
  it('renders each doubly-enabled skill as a labelled block, in link order', () => {
    const links = [
      link({ name: 'pr-quality-rubric', order: 0 }),
      link({ name: 'secret-leakage-gate', order: 1 }),
    ];
    const rendered = renderSkillBlocks(links);
    expect(rendered.map((r) => r.name)).toEqual(['pr-quality-rubric', 'secret-leakage-gate']);
    expect(rendered[0]!.block).toBe(`### pr-quality-rubric\nBody of pr-quality-rubric`);
  });

  it('drops a skill disabled globally (skill.enabled = false), even if its link is enabled', () => {
    const links = [link({ name: 'phantom-api-gate', skillEnabled: false, linkEnabled: true })];
    expect(renderSkillBlocks(links)).toEqual([]);
  });

  it('drops a skill whose LINK is disabled, even if the skill itself is enabled', () => {
    const links = [link({ name: 'no-then-chains', skillEnabled: true, linkEnabled: false })];
    expect(renderSkillBlocks(links)).toEqual([]);
  });

  it('drops a skill disabled at BOTH gates', () => {
    const links = [link({ name: 'both-off', skillEnabled: false, linkEnabled: false })];
    expect(renderSkillBlocks(links)).toEqual([]);
  });

  it('keeps enabled skills and drops disabled ones from a mixed set, preserving order', () => {
    const links = [
      link({ name: 'pr-quality-rubric', order: 0 }),
      link({ name: 'phantom-api-gate', order: 1, skillEnabled: false }),
      link({ name: 'lethal-trifecta', order: 2 }),
    ];
    expect(renderSkillBlocks(links).map((r) => r.name)).toEqual([
      'pr-quality-rubric',
      'lethal-trifecta',
    ]);
  });

  it('returns an empty array for no links', () => {
    expect(renderSkillBlocks([])).toEqual([]);
  });
});
