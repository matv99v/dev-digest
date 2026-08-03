import type { SkillImportPreview, SkillType } from '@devdigest/shared';
import { DEFAULT_IMPORT_SKILL_TYPE, MAX_IMPORT_BODY_CHARS } from './constants.js';

/**
 * Import — pure text parsing, no I/O. Turns a markdown file's contents into a
 * `SkillImportPreview`; nothing is persisted here (that's `POST /skills`,
 * called separately once the user confirms the preview). Markdown only: there
 * is no channel here an executable could travel through, and nothing is ever
 * written to disk.
 */

const VALID_SKILL_TYPES: readonly SkillType[] = ['rubric', 'convention', 'security', 'custom'];

const ALLOWED_EXTENSIONS = ['.md', '.markdown'];

export class ImportRejectedError extends Error {}

/** Strip a trailing extension and turn `-`/`_` into spaces, for the filename
 *  fallback name (e.g. `corner-case-checklist.md` → `corner-case-checklist`). */
function nameFromFilename(filename: string): string {
  return filename.replace(/\.(md|markdown)$/i, '').trim() || 'untitled-skill';
}

interface ParsedFrontmatter {
  fields: Record<string, string>;
  rest: string;
}

/**
 * Minimal two-key frontmatter parser (`name:` / `description:` / `type:`) — a
 * full YAML parser would be a new dependency for a feature that only ever
 * needs flat string values.
 */
function parseFrontmatter(content: string): ParsedFrontmatter {
  if (!content.startsWith('---')) return { fields: {}, rest: content };
  const lines = content.split('\n');
  if (lines[0]?.trim() !== '---') return { fields: {}, rest: content };

  const closingIndex = lines.slice(1).findIndex((l) => l.trim() === '---');
  if (closingIndex === -1) return { fields: {}, rest: content };

  const fields: Record<string, string> = {};
  for (const line of lines.slice(1, closingIndex + 1)) {
    const match = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = rawValue!.trim().replace(/^["'](.*)["']$/, '$1');
    fields[key!.toLowerCase()] = value;
  }
  const rest = lines.slice(closingIndex + 2).join('\n');
  return { fields, rest };
}

/** First `# Heading` line, or undefined when the body has none. */
function firstHeading(body: string): string | undefined {
  const match = /^#\s+(.+)$/m.exec(body);
  return match?.[1]?.trim();
}

/** First non-empty paragraph that isn't a heading — the description fallback. */
function firstParagraph(body: string): string {
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
    return trimmed;
  }
  return '';
}

export function parseSkillImport(filename: string, content: string): SkillImportPreview {
  const hasAllowedExtension = ALLOWED_EXTENSIONS.some((ext) =>
    filename.toLowerCase().endsWith(ext),
  );
  if (!hasAllowedExtension) {
    throw new ImportRejectedError('Only .md / .markdown files can be imported');
  }

  const warnings: string[] = [];
  let body = content;
  if (body.length > MAX_IMPORT_BODY_CHARS) {
    body = body.slice(0, MAX_IMPORT_BODY_CHARS);
    warnings.push(
      `Body truncated to ${MAX_IMPORT_BODY_CHARS.toLocaleString()} characters (original was longer).`,
    );
  }

  const { fields, rest } = parseFrontmatter(body);

  const name = fields.name || firstHeading(rest) || nameFromFilename(filename);
  const description = fields.description || firstParagraph(rest);
  const type = (VALID_SKILL_TYPES as readonly string[]).includes(fields.type ?? '')
    ? (fields.type as SkillType)
    : DEFAULT_IMPORT_SKILL_TYPE;

  if (!description) {
    warnings.push('No description found — add one before enabling this skill.');
  }

  // `rest` — the body with any frontmatter block stripped (identical to
  // `body` when there was none to strip).
  return { name, description, type, body: rest, warnings };
}
