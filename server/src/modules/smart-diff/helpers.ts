import type { ProposedSplit, SmartDiff, SmartDiffFile, SmartDiffGroup, SmartDiffRole } from '@devdigest/shared';
import {
  BARREL_BASENAMES,
  CI_PATH_PREFIXES,
  CONFIG_BASENAME_PATTERNS,
  CONFIG_BASENAMES,
  DEFAULT_ROLE,
  DOC_EXTENSIONS,
  GENERATED_BASENAME_SUFFIXES,
  GENERATED_PATH_SEGMENTS,
  LOCKFILE_BASENAMES,
  MAX_FINDING_LINES_PER_FILE,
  MAX_FINDING_LINE_SPAN,
  MAX_PROPOSED_SPLITS,
  MIN_SPLIT_FILES,
  ROLE_ORDER,
  SPLIT_KEY_SEGMENTS,
  SPLIT_TOO_BIG_MAX_FILES,
  SPLIT_TOO_BIG_MAX_LINES,
  TEST_BASENAME_PATTERNS,
  TEST_PATH_SEGMENTS,
} from './constants.js';

/**
 * Smart Diff (L03) — pure classifier and grouping logic. Zero I/O, zero Node
 * API, and no literal pattern or threshold: every one of those lives in
 * `constants.ts` and is imported here (R5). This is the tested surface per
 * onion-architecture; `service.ts` is the only caller.
 *
 * Row shapes below are kept STRUCTURAL (not imported from a repository),
 * mirroring `modules/intent/helpers.ts`'s `IntentRow` — so this file stays
 * free of any repository/db import.
 */

/** The subset of a `pr_files` row the classifier needs. */
export interface SmartDiffFileInput {
  path: string;
  additions: number;
  deletions: number;
}

/** The subset of a `findings` row `findingLinesFor` needs. */
export interface SmartDiffFindingInput {
  file: string;
  startLine: number;
  endLine: number;
  dismissedAt: Date | null;
}

function basenameOf(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? path : path.slice(idx + 1);
}

/** Case-insensitive suffix match — used for the two extension-shaped lists
 *  (`DOC_EXTENSIONS`, `GENERATED_BASENAME_SUFFIXES`), per the "extension
 *  rules case-insensitively" matching rule. */
function hasSuffixCaseInsensitive(basename: string, suffixes: readonly string[]): boolean {
  const lower = basename.toLowerCase();
  return suffixes.some((suffix) => lower.endsWith(suffix.toLowerCase()));
}

/**
 * Classify a single repo-relative path into a `SmartDiffRole`. First match
 * wins, checked in the exact order documented in `constants.ts`'s header
 * (R2's lock-file rule is unconditional and runs first).
 *
 * Matching is on a normalised path: segment rules match against `'/' + path`
 * (so a leading `test/` matches `/test/`), basename rules against the last
 * segment, and the two extension-shaped lists case-insensitively. `path.posix`
 * is not needed and is not imported — this file stays free of Node APIs.
 */
export function classifyPath(path: string): SmartDiffRole {
  const normalized = `/${path}`;
  const basename = basenameOf(path);

  // 1 — lock-files, unconditional, ahead of every other rule (R2).
  if (LOCKFILE_BASENAMES.includes(basename)) return 'boilerplate';

  // 2 — generated output / snapshots.
  if (GENERATED_PATH_SEGMENTS.some((segment) => normalized.includes(segment))) return 'boilerplate';
  if (hasSuffixCaseInsensitive(basename, GENERATED_BASENAME_SUFFIXES)) return 'boilerplate';

  // 3 — documentation.
  if (hasSuffixCaseInsensitive(basename, DOC_EXTENSIONS)) return 'boilerplate';

  // 4 — tests.
  if (TEST_BASENAME_PATTERNS.some((re) => re.test(basename))) return 'wiring';
  if (TEST_PATH_SEGMENTS.some((segment) => normalized.includes(segment))) return 'wiring';

  // 5 — configuration / CI.
  if (CONFIG_BASENAMES.includes(basename)) return 'wiring';
  if (CONFIG_BASENAME_PATTERNS.some((re) => re.test(basename))) return 'wiring';
  if (CI_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) return 'wiring';

  // 6 — barrels.
  if (BARREL_BASENAMES.includes(basename)) return 'wiring';

  // 7 — default: an unrecognised path is business logic until proven otherwise.
  return DEFAULT_ROLE;
}

/**
 * `finding_lines` (R6): the ascending, de-duplicated set of lines covered by
 * `path`'s non-dismissed findings, expanded from `start_line..end_line`. A
 * finding whose span exceeds `MAX_FINDING_LINE_SPAN` contributes only its
 * `start_line` (a model emitting `end_line` at end-of-file must not produce a
 * huge array); the result is truncated at `MAX_FINDING_LINES_PER_FILE`.
 *
 * Matching a finding's `file` to `path` is EXACT equality, never
 * `startsWith` — a prefix match would leak one file's findings onto a
 * sibling path.
 */
export function findingLinesFor(path: string, findings: readonly SmartDiffFindingInput[]): number[] {
  const lines = new Set<number>();
  for (const finding of findings) {
    if (finding.file !== path) continue;
    if (finding.dismissedAt != null) continue;
    const span = finding.endLine - finding.startLine + 1;
    if (span > MAX_FINDING_LINE_SPAN) {
      lines.add(finding.startLine);
      continue;
    }
    for (let line = finding.startLine; line <= finding.endLine; line++) lines.add(line);
  }
  return Array.from(lines)
    .sort((a, b) => a - b)
    .slice(0, MAX_FINDING_LINES_PER_FILE);
}

/**
 * Total order within a group (R3): files carrying findings sort first, then
 * by descending `additions + deletions`, then by `path` ascending — so two
 * calls on unchanged data return an identical body.
 */
export function sortFilesInGroup(files: readonly SmartDiffFile[]): SmartDiffFile[] {
  return [...files].sort((a, b) => {
    const aHasFindings = a.finding_lines.length > 0 ? 1 : 0;
    const bHasFindings = b.finding_lines.length > 0 ? 1 : 0;
    if (aHasFindings !== bHasFindings) return bHasFindings - aHasFindings;

    const aSize = a.additions + a.deletions;
    const bSize = b.additions + b.deletions;
    if (aSize !== bSize) return bSize - aSize;

    if (a.path < b.path) return -1;
    if (a.path > b.path) return 1;
    return 0;
  });
}

/** The first `SPLIT_KEY_SEGMENTS` path segments, joined — the grouping key a
 *  proposed split is named after. A path with fewer segments than
 *  `SPLIT_KEY_SEGMENTS` keys on everything it has. */
export function splitKeyFor(path: string): string {
  return path.split('/').slice(0, SPLIT_KEY_SEGMENTS).join('/');
}

interface SplitCandidate {
  name: string;
  files: string[];
  changedLines: number;
}

/**
 * `split_suggestion` (R8). `files` must already exclude `boilerplate` —
 * `total_lines` and the too-big file count are both computed over exactly
 * what's passed in, so a caller including boilerplate would inflate both.
 */
export function buildSplitSuggestion(files: readonly SmartDiffFile[]): SmartDiff['split_suggestion'] {
  const total_lines = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
  const too_big = total_lines > SPLIT_TOO_BIG_MAX_LINES || files.length > SPLIT_TOO_BIG_MAX_FILES;

  if (!too_big) {
    return { too_big: false, total_lines, proposed_splits: [] };
  }

  const byKey = new Map<string, SplitCandidate>();
  for (const file of files) {
    const key = splitKeyFor(file.path);
    const candidate = byKey.get(key) ?? { name: key, files: [], changedLines: 0 };
    candidate.files.push(file.path);
    candidate.changedLines += file.additions + file.deletions;
    byKey.set(key, candidate);
  }

  const proposed_splits: ProposedSplit[] = Array.from(byKey.values())
    .filter((c) => c.files.length >= MIN_SPLIT_FILES)
    .sort((a, b) => {
      if (a.changedLines !== b.changedLines) return b.changedLines - a.changedLines;
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      return 0;
    })
    .slice(0, MAX_PROPOSED_SPLITS)
    .map((c) => ({ name: c.name, files: c.files }));

  return { too_big: true, total_lines, proposed_splits };
}

/**
 * Build the full `SmartDiff` from a PR's files and findings. Always emits
 * the three groups in `ROLE_ORDER` (R1, R3), even when a group is empty, and
 * sets every `pseudocode_summary` to `null` (R7) — no LLM step, no heuristic.
 */
export function buildSmartDiff(
  files: readonly SmartDiffFileInput[],
  findings: readonly SmartDiffFindingInput[],
): SmartDiff {
  const classified = files.map((file) => ({
    role: classifyPath(file.path),
    file: {
      path: file.path,
      pseudocode_summary: null,
      additions: file.additions,
      deletions: file.deletions,
      finding_lines: findingLinesFor(file.path, findings),
    } satisfies SmartDiffFile,
  }));

  const groups: SmartDiffGroup[] = ROLE_ORDER.map((role) => ({
    role,
    files: sortFilesInGroup(classified.filter((c) => c.role === role).map((c) => c.file)),
  }));

  const nonBoilerplate = classified.filter((c) => c.role !== 'boilerplate').map((c) => c.file);
  const split_suggestion = buildSplitSuggestion(nonBoilerplate);

  return { groups, split_suggestion };
}
