import { describe, it, expect } from 'vitest';
import type { SmartDiffFile } from '@devdigest/shared';
import {
  buildSmartDiff,
  buildSplitSuggestion,
  classifyPath,
  findingLinesFor,
  splitKeyFor,
  type SmartDiffFileInput,
  type SmartDiffFindingInput,
} from '../src/modules/smart-diff/helpers.js';
import {
  LOCKFILE_BASENAMES,
  MAX_FINDING_LINES_PER_FILE,
  MAX_FINDING_LINE_SPAN,
  MAX_PROPOSED_SPLITS,
  MIN_SPLIT_FILES,
  ROLE_ORDER,
  SPLIT_TOO_BIG_MAX_LINES,
} from '../src/modules/smart-diff/constants.js';

/**
 * Unit coverage for Smart Diff's (L03) pure surface — no DB, no LLM, no
 * filesystem. One case per row of docs/plans/04-smart-diff.md's "one case
 * per behaviour that would catch a real regression" table.
 */

function mkFinding(overrides: Partial<SmartDiffFindingInput> & { file: string }): SmartDiffFindingInput {
  return { startLine: 1, endLine: 1, dismissedAt: null, ...overrides };
}

describe('classifyPath', () => {
  it('every LOCKFILE_BASENAMES entry is boilerplate, at any depth', () => {
    for (const basename of LOCKFILE_BASENAMES) {
      expect(classifyPath(basename)).toBe('boilerplate');
      expect(classifyPath(`some/deep/nested/dir/${basename}`)).toBe('boilerplate');
    }
  });

  it.each([
    ['server/pnpm-lock.yaml', 'boilerplate'],
    ['server/src/db/migrations/meta/_journal.json', 'boilerplate'],
    ['docs/plans/04-smart-diff.md', 'boilerplate'],
    ['server/test/smart-diff-helpers.test.ts', 'wiring'],
    ['client/vitest.config.ts', 'wiring'],
    ['server/test/helpers/pg.ts', 'wiring'],
    ['.github/workflows/server-unit.yml', 'wiring'],
    ['client/src/components/diff-viewer/index.ts', 'wiring'],
    ['server/src/modules/smart-diff/service.ts', 'core'],
    ['server/src/db/migrations/0014_x.sql', 'core'],
  ])('%s → %s', (path, role) => {
    expect(classifyPath(path)).toBe(role);
  });
});

describe('findingLinesFor', () => {
  it('a 3-line finding yields its three lines', () => {
    const findings = [mkFinding({ file: 'a.ts', startLine: 5, endLine: 7 })];
    expect(findingLinesFor('a.ts', findings)).toEqual([5, 6, 7]);
  });

  it('two overlapping findings de-duplicate', () => {
    const findings = [
      mkFinding({ file: 'a.ts', startLine: 5, endLine: 7 }),
      mkFinding({ file: 'a.ts', startLine: 6, endLine: 8 }),
    ];
    expect(findingLinesFor('a.ts', findings)).toEqual([5, 6, 7, 8]);
  });

  it('a dismissed finding contributes nothing', () => {
    const findings = [mkFinding({ file: 'a.ts', startLine: 5, endLine: 7, dismissedAt: new Date() })];
    expect(findingLinesFor('a.ts', findings)).toEqual([]);
  });

  it('a span over MAX_FINDING_LINE_SPAN contributes only start_line', () => {
    const startLine = 1;
    const endLine = startLine + MAX_FINDING_LINE_SPAN; // span = MAX_FINDING_LINE_SPAN + 1
    const findings = [mkFinding({ file: 'a.ts', startLine, endLine })];
    expect(findingLinesFor('a.ts', findings)).toEqual([startLine]);
  });

  it('a span exactly at MAX_FINDING_LINE_SPAN expands in full', () => {
    const startLine = 1;
    const endLine = startLine + MAX_FINDING_LINE_SPAN - 1; // span === MAX_FINDING_LINE_SPAN
    const findings = [mkFinding({ file: 'a.ts', startLine, endLine })];
    expect(findingLinesFor('a.ts', findings)).toHaveLength(MAX_FINDING_LINE_SPAN);
  });

  it('a finding on a different file contributes nothing (exact match, never a prefix)', () => {
    const findings = [mkFinding({ file: 'a.ts.orig', startLine: 1, endLine: 1 })];
    expect(findingLinesFor('a.ts', findings)).toEqual([]);
  });

  it('truncates at MAX_FINDING_LINES_PER_FILE', () => {
    const many = Array.from({ length: MAX_FINDING_LINES_PER_FILE + 50 }, (_, i) =>
      mkFinding({ file: 'a.ts', startLine: i + 1, endLine: i + 1 }),
    );
    const lines = findingLinesFor('a.ts', many);
    expect(lines).toHaveLength(MAX_FINDING_LINES_PER_FILE);
    expect(lines[0]).toBe(1);
  });
});

describe('splitKeyFor', () => {
  it('keys on the first SPLIT_KEY_SEGMENTS path segments', () => {
    expect(splitKeyFor('src/modules/smart-diff/service.ts')).toBe('src/modules');
  });

  it('a path with fewer segments keys on everything it has', () => {
    expect(splitKeyFor('README.md')).toBe('README.md');
  });
});

describe('buildSplitSuggestion', () => {
  const file = (path: string, changed: number, findingLines: number[] = []): SmartDiffFile => ({
    path,
    pseudocode_summary: null,
    additions: changed,
    deletions: 0,
    finding_lines: findingLines,
  });

  it('boundary at SPLIT_TOO_BIG_MAX_LINES (false) and +1 (true)', () => {
    const atBoundary = buildSplitSuggestion([file('src/a.ts', SPLIT_TOO_BIG_MAX_LINES)]);
    expect(atBoundary.too_big).toBe(false);
    expect(atBoundary.proposed_splits).toEqual([]);

    const overBoundary = buildSplitSuggestion([file('src/a.ts', SPLIT_TOO_BIG_MAX_LINES + 1)]);
    expect(overBoundary.too_big).toBe(true);
  });

  it('not too_big ⇒ proposed_splits is empty', () => {
    const result = buildSplitSuggestion([file('src/a.ts', 10)]);
    expect(result.too_big).toBe(false);
    expect(result.proposed_splits).toEqual([]);
  });

  it('splits group by two path segments, drop groups under MIN_SPLIT_FILES, sorted, and capped at MAX_PROPOSED_SPLITS', () => {
    const files = [
      file('src/moduleA/f1.ts', 75),
      file('src/moduleA/f2.ts', 75),
      file('src/moduleB/f1.ts', 50),
      file('src/moduleB/f2.ts', 50),
      file('src/moduleC/f1.ts', 50),
      file('src/moduleC/f2.ts', 50),
      file('src/moduleD/f1.ts', 50),
      file('src/moduleD/f2.ts', 50),
      file('src/moduleE/f1.ts', 50),
      file('src/moduleE/f2.ts', 50),
      // Below MIN_SPLIT_FILES — dropped entirely, even though it pushes the
      // total over the too_big threshold.
      file('src/moduleF/only.ts', 50),
    ];
    expect(MIN_SPLIT_FILES).toBe(2);
    expect(MAX_PROPOSED_SPLITS).toBe(4);

    const result = buildSplitSuggestion(files);
    expect(result.too_big).toBe(true);
    expect(result.proposed_splits).toHaveLength(MAX_PROPOSED_SPLITS);
    expect(result.proposed_splits.map((s) => s.name)).toEqual([
      'src/moduleA',
      'src/moduleB',
      'src/moduleC',
      'src/moduleD',
    ]);
    expect(result.proposed_splits.every((s) => s.name !== 'src/moduleF')).toBe(true);
    expect(result.proposed_splits[0]!.files).toEqual(['src/moduleA/f1.ts', 'src/moduleA/f2.ts']);
  });
});

describe('buildSmartDiff', () => {
  it('a 5 000-line lock-file alone does not make a PR too_big', () => {
    const files: SmartDiffFileInput[] = [{ path: 'pnpm-lock.yaml', additions: 5000, deletions: 0 }];
    const result = buildSmartDiff(files, []);
    expect(result.split_suggestion.too_big).toBe(false);
    expect(result.split_suggestion.total_lines).toBe(0);
  });

  it('returns all three groups in ROLE_ORDER, empty ones included', () => {
    const files: SmartDiffFileInput[] = [{ path: 'src/service.ts', additions: 1, deletions: 0 }];
    const result = buildSmartDiff(files, []);
    expect(result.groups.map((g) => g.role)).toEqual([...ROLE_ORDER]);
    expect(result.groups.find((g) => g.role === 'wiring')!.files).toEqual([]);
    expect(result.groups.find((g) => g.role === 'boilerplate')!.files).toEqual([]);
  });

  it('within-group order is findings → size → path', () => {
    const files: SmartDiffFileInput[] = [
      { path: 'src/big.ts', additions: 100, deletions: 0 },
      { path: 'src/small.ts', additions: 10, deletions: 0 },
      { path: 'src/withFinding.ts', additions: 5, deletions: 0 },
    ];
    const findings: SmartDiffFindingInput[] = [
      mkFinding({ file: 'src/withFinding.ts', startLine: 1, endLine: 1 }),
    ];
    const result = buildSmartDiff(files, findings);
    const core = result.groups.find((g) => g.role === 'core')!;
    expect(core.files.map((f) => f.path)).toEqual(['src/withFinding.ts', 'src/big.ts', 'src/small.ts']);
  });

  it('the same input built twice is deep-equal', () => {
    const files: SmartDiffFileInput[] = [
      { path: 'src/b.ts', additions: 5, deletions: 0 },
      { path: 'src/a.ts', additions: 5, deletions: 0 },
      { path: 'pnpm-lock.yaml', additions: 5000, deletions: 0 },
    ];
    const findings: SmartDiffFindingInput[] = [mkFinding({ file: 'src/a.ts', startLine: 1, endLine: 2 })];
    expect(buildSmartDiff(files, findings)).toEqual(buildSmartDiff(files, findings));
  });

  it("every file's pseudocode_summary is null", () => {
    const files: SmartDiffFileInput[] = [
      { path: 'src/a.ts', additions: 1, deletions: 0 },
      { path: 'pnpm-lock.yaml', additions: 1, deletions: 0 },
      { path: 'package.json', additions: 1, deletions: 0 },
    ];
    const result = buildSmartDiff(files, []);
    for (const group of result.groups) {
      for (const file of group.files) {
        expect(file.pseudocode_summary).toBeNull();
      }
    }
  });

  it('findings on a lock-file still leave it in the boilerplate group', () => {
    const files: SmartDiffFileInput[] = [{ path: 'pnpm-lock.yaml', additions: 3, deletions: 0 }];
    const findings: SmartDiffFindingInput[] = [mkFinding({ file: 'pnpm-lock.yaml', startLine: 1, endLine: 1 })];
    const result = buildSmartDiff(files, findings);
    const boilerplate = result.groups.find((g) => g.role === 'boilerplate')!;
    expect(boilerplate.files.map((f) => f.path)).toEqual(['pnpm-lock.yaml']);
    expect(boilerplate.files[0]!.finding_lines).toEqual([1]);
  });
});
