import { z } from 'zod';
import type {
  Convention,
  ConventionEvidence,
  ConventionSkillDraft,
  ConventionSkillDraftMode,
  ConventionStatus,
} from '@devdigest/shared';
import { VERIFY_LINE_SLACK } from './constants.js';
import type { ConventionRow } from './repository.js';

/**
 * Pure helpers for the conventions module — no I/O. `verifyCandidates` and
 * `buildSkillDrafts` are the two load-bearing functions: the first is what
 * stops a hallucinated file/line/snippet from ever reaching the DB, the
 * second is what makes a rejected/pending candidate structurally unable to
 * reach a skill body (it only ever reads rows with status === 'accepted').
 */

// ---------------------------------------------------------------------------
// Raw model output — internal to this module, never a shared contract. The
// model cites file/line/snippet itself; verifyCandidates checks it in code.
// ---------------------------------------------------------------------------

export const RawConventionCandidate = z.object({
  rule: z.string().min(1),
  category: z.string().min(1),
  evidence_path: z.string().min(1),
  evidence_line_start: z.number().int().positive(),
  evidence_line_end: z.number().int().positive(),
  evidence_snippet: z.string().min(1),
  confidence: z.number().min(0).max(1),
});
export type RawConventionCandidate = z.infer<typeof RawConventionCandidate>;

export const RawConventionCandidates = z.array(RawConventionCandidate);

export type VerifiedCandidate = RawConventionCandidate;

/** Collapse whitespace runs to one space and trim, so formatting drift doesn't fail a match. */
function normalizeWhitespace(line: string): string {
  return line.trim().replace(/\s+/g, ' ');
}

/**
 * Verify every raw candidate against the actual sampled file text — pure
 * function, no I/O; `read` is injected so this is unit-testable without a
 * DB/LLM/filesystem. A candidate is dropped unless:
 *   1. `read(evidence_path)` returns content (the file was actually sampled).
 *   2. The cited line range falls inside the file's line count.
 *   3. Every non-empty snippet line (whitespace-normalized) is found within
 *      `VERIFY_LINE_SLACK` lines of the cited range.
 * When the snippet is found but at a different offset within that window, the
 * candidate is SNAPPED to where it actually is rather than dropped.
 */
export function verifyCandidates(
  candidates: RawConventionCandidate[],
  read: (path: string) => string | null,
): { verified: VerifiedCandidate[]; droppedCount: number } {
  const verified: VerifiedCandidate[] = [];
  let droppedCount = 0;

  for (const c of candidates) {
    const content = read(c.evidence_path);
    if (content == null) {
      droppedCount += 1;
      continue;
    }

    const lines = content.split('\n');
    if (
      c.evidence_line_start < 1 ||
      c.evidence_line_end < c.evidence_line_start ||
      c.evidence_line_end > lines.length
    ) {
      droppedCount += 1;
      continue;
    }

    const snippetLines = c.evidence_snippet
      .split('\n')
      .map(normalizeWhitespace)
      .filter((l) => l.length > 0);
    if (snippetLines.length === 0) {
      droppedCount += 1;
      continue;
    }

    const windowStart = Math.max(1, c.evidence_line_start - VERIFY_LINE_SLACK);
    const windowEnd = Math.min(lines.length, c.evidence_line_end + VERIFY_LINE_SLACK);
    const windowNormalized: string[] = [];
    for (let ln = windowStart; ln <= windowEnd; ln += 1) {
      windowNormalized.push(normalizeWhitespace(lines[ln - 1] ?? ''));
    }

    const allFound = snippetLines.every((sl) => windowNormalized.includes(sl));
    if (!allFound) {
      droppedCount += 1;
      continue;
    }

    // Snap to the actual offset of the snippet's first line within the window.
    const firstIdx = windowNormalized.indexOf(snippetLines[0]!);
    let start = c.evidence_line_start;
    let end = c.evidence_line_end;
    if (firstIdx >= 0) {
      const actualFirstLine = windowStart + firstIdx;
      const delta = actualFirstLine - c.evidence_line_start;
      if (delta !== 0) {
        start = c.evidence_line_start + delta;
        end = c.evidence_line_end + delta;
      }
    }

    verified.push({ ...c, evidence_line_start: start, evidence_line_end: end });
  }

  return { verified, droppedCount };
}

// ---------------------------------------------------------------------------
// Row ⇄ DTO mapping
// ---------------------------------------------------------------------------

/** Map a persisted convention row to the public `Convention` DTO. */
export function toConventionDto(row: ConventionRow): Convention {
  const evidence: ConventionEvidence = {
    path: row.evidencePath ?? '',
    line_start: row.evidenceLineStart ?? 0,
    line_end: row.evidenceLineEnd ?? 0,
    snippet: row.evidenceSnippet ?? '',
  };
  return {
    // The service always sets repoId on insert; the column is nullable at the
    // schema level only to allow future non-scan-created rows.
    id: row.id,
    repo_id: row.repoId ?? '',
    category: row.category,
    rule: row.rule,
    evidence,
    confidence: row.confidence ?? 0,
    status: row.status as ConventionStatus,
    skill_id: row.skillId,
    scanned_sha: row.scannedSha,
    created_at: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Skill draft composition
// ---------------------------------------------------------------------------

/** Deterministic, filesystem/heading-safe slug from arbitrary text. */
function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'rule';
}

function renderSection(slug: string, row: ConventionRow): string {
  const location =
    row.evidencePath != null
      ? `\`${row.evidencePath}:${row.evidenceLineStart}-${row.evidenceLineEnd}\``
      : 'an unspecified location';
  const snippet = row.evidenceSnippet ? `\n\n\`\`\`\n${row.evidenceSnippet}\n\`\`\`` : '';
  return `## ${slug}\n${row.rule}\n\nDetected in ${location}:${snippet}`;
}

function renderDraftBody(name: string, repoName: string, rows: ConventionRow[]): string {
  const seenSlugs = new Set<string>();
  const sections = rows.map((row) => {
    let slug = slugify(row.rule);
    if (seenSlugs.has(slug)) slug = `${slug}-${row.id.slice(0, 8)}`;
    seenSlugs.add(slug);
    return renderSection(slug, row);
  });
  return (
    `# ${name}\n\nHouse conventions for \`${repoName}\`. Flag changes that violate any rule ` +
    `below and cite the offending \`file:line\`.\n\n${sections.join('\n\n')}\n`
  );
}

function buildDraft(name: string, repoName: string, rows: ConventionRow[]): ConventionSkillDraft {
  return {
    name,
    description: `Conventions extracted from \`${repoName}\`.`,
    type: 'convention',
    enabled: true,
    body: renderDraftBody(name, repoName, rows),
    convention_ids: rows.map((r) => r.id),
    evidence_files: [...new Set(rows.map((r) => r.evidencePath).filter((p): p is string => !!p))],
  };
}

/**
 * Compose skill drafts from accepted convention rows. Filters to
 * `status === 'accepted'` itself — the ONE gate that makes a rejected or
 * still-pending candidate structurally unable to reach a skill body,
 * regardless of what the caller passes in.
 */
export function buildSkillDrafts(
  repoName: string,
  acceptedRows: ConventionRow[],
  mode: ConventionSkillDraftMode,
): ConventionSkillDraft[] {
  const accepted = acceptedRows.filter((r) => r.status === 'accepted');
  if (accepted.length === 0) return [];

  if (mode === 'merged') {
    return [buildDraft(`${repoName}-conventions`, repoName, accepted)];
  }

  const byCategory = new Map<string, ConventionRow[]>();
  for (const row of accepted) {
    const category = row.category ?? 'general';
    const arr = byCategory.get(category);
    if (arr) arr.push(row);
    else byCategory.set(category, [row]);
  }

  return [...byCategory.entries()].map(([category, rows]) =>
    buildDraft(`${repoName}-${slugify(category)}-conventions`, repoName, rows),
  );
}
