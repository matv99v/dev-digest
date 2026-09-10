/**
 * Findings → what actually reaches the model (R6).
 *
 * A review's findings are the largest thing this server returns, and two of
 * their fields carry almost all of the weight: `rationale` and `suggestion` are
 * multi-paragraph markdown, everything else is a line number or a word. So
 * `concise` drops exactly those two and `full` adds them back — that is the
 * whole of the `detail` axis.
 *
 * **`severity` and `offset`/`limit` are independent axes and must compose.**
 * `severity` decides *which* findings survive; `offset`/`limit` decide *which
 * window* of the survivors is returned. Applying the window before the filter
 * would silently make `severity` mean "of the first 20", which is the bug this
 * file's shape exists to prevent — the filter runs first, the total is reported
 * over the filtered set, and a second call with a bumped `offset` therefore
 * pages through the same set rather than a shifting one.
 *
 * Pure: no `fetch`, no MCP types, no I/O. The tool resolves and fetches; this
 * decides what comes back.
 */
import type { FindingCategory, FindingLite, Severity } from '../api/types';

export const SEVERITIES: readonly Severity[] = ['CRITICAL', 'WARNING', 'SUGGESTION'];

export type Detail = 'concise' | 'full';

/** `get_findings`'s window defaults (R6). `run_agent_on_pr` reuses them so a
 *  completed run and a later `get_findings` on the same PR agree. */
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
export const DEFAULT_OFFSET = 0;

/** What every finding carries, at either detail level. */
export interface ConciseFinding {
  id: string;
  severity: Severity;
  category: FindingCategory;
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  confidence: number;
}

/** `full` = concise + the two markdown fields. `suggestion` is nullable in the
 *  contract and stays so; a finding with no fix proposal is normal. */
export interface FullFinding extends ConciseFinding {
  rationale: string;
  suggestion: string | null;
}

export interface ShapeOptions {
  severity?: readonly Severity[];
  limit?: number;
  offset?: number;
  detail?: Detail;
}

export interface ShapedFindings {
  detail: Detail;
  findings: Array<ConciseFinding | FullFinding>;
  /** Findings on the reviews that were read, before `severity` narrowed them. */
  total_before_filter: number;
  /** Findings that survived `severity` — **the** total to page against. */
  total_matching: number;
  returned: number;
  offset: number;
  limit: number;
  /** How many `severity` removed, and how many the window left behind. Reported
   *  separately because they are widened by different parameters. */
  dropped_by_severity_filter: number;
  omitted_by_window: number;
  /** Counts over every finding *before* the filter, so the caller can see what
   *  widening `severity` would actually return rather than guessing. */
  counts_by_severity: Record<Severity, number>;
  /** `offset` for the next page, or `null` when this page is the last. */
  next_offset: number | null;
  /** Names the parameter that would widen this result. A truncation notice that
   *  does not say what to change is a dead end. */
  widen_with: string;
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(limit)));
}

function clampOffset(offset: number | undefined): number {
  if (offset === undefined || !Number.isFinite(offset)) return DEFAULT_OFFSET;
  return Math.max(0, Math.trunc(offset));
}

function countBySeverity(findings: readonly FindingLite[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) {
    if (f.severity in counts) counts[f.severity] += 1;
  }
  return counts;
}

/**
 * Project one finding. The `concise` object is built key by key rather than by
 * deleting from a spread: a key that is never written cannot be serialized, so
 * "`rationale` is absent" is a property of the code and not of a cleanup step
 * someone can forget.
 */
function project(f: FindingLite, detail: Detail): ConciseFinding | FullFinding {
  const concise: ConciseFinding = {
    id: f.id,
    severity: f.severity,
    category: f.category,
    title: f.title,
    file: f.file,
    start_line: f.start_line,
    end_line: f.end_line,
    confidence: f.confidence,
  };
  if (detail === 'concise') return concise;
  return { ...concise, rationale: f.rationale, suggestion: f.suggestion ?? null };
}

function widenAdvice(
  droppedByFilter: number,
  omittedByWindow: number,
  detail: Detail,
  nextOffset: number | null,
): string {
  const advice: string[] = [];
  if (droppedByFilter > 0) {
    advice.push(
      `${droppedByFilter} finding(s) were removed by the \`severity\` filter — drop or widen ` +
        '`severity` to see them.',
    );
  }
  if (omittedByWindow > 0 && nextOffset !== null) {
    advice.push(
      `${omittedByWindow} matching finding(s) are outside this window — call again with ` +
        `\`offset: ${nextOffset}\` for the next page, or raise \`limit\` (max ${MAX_LIMIT}).`,
    );
  } else if (omittedByWindow > 0) {
    advice.push(
      `${omittedByWindow} matching finding(s) are before this window — lower \`offset\` to ` +
        'see them.',
    );
  }
  if (detail === 'concise') {
    advice.push('`rationale` and `suggestion` are omitted at this detail — pass `detail: "full"`.');
  }
  return advice.length === 0
    ? 'Nothing was filtered or truncated; this is every finding, in full.'
    : advice.join(' ');
}

/**
 * Filter by severity, then window by offset/limit, then project by detail —
 * in that order, and the order is the contract.
 */
export function shapeFindings(
  findings: readonly FindingLite[],
  options: ShapeOptions = {},
): ShapedFindings {
  const detail: Detail = options.detail ?? 'concise';
  const limit = clampLimit(options.limit);
  const offset = clampOffset(options.offset);

  const wanted = options.severity;
  const matching =
    wanted === undefined || wanted.length === 0
      ? [...findings]
      : findings.filter((f) => wanted.includes(f.severity));

  const page = matching.slice(offset, offset + limit);
  const nextOffset = offset + page.length < matching.length ? offset + page.length : null;

  return {
    detail,
    findings: page.map((f) => project(f, detail)),
    total_before_filter: findings.length,
    total_matching: matching.length,
    returned: page.length,
    offset,
    limit,
    dropped_by_severity_filter: findings.length - matching.length,
    omitted_by_window: matching.length - page.length,
    counts_by_severity: countBySeverity(findings),
    next_offset: nextOffset,
    widen_with: widenAdvice(
      findings.length - matching.length,
      matching.length - page.length,
      detail,
      nextOffset,
    ),
  };
}
