import { unzipSync, strFromU8 } from 'fflate';
import type { Skill, SkillImportPreview, SkillVersion } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import type { SkillRow, SkillVersionRow } from './repository.js';
import { MAX_IMPORT_BYTES } from './constants.js';

/**
 * Pure helpers for the skills module — DB row ⇄ DTO mapping and import-file
 * parsing. No I/O; parsing operates purely on an in-memory buffer so it is
 * unit-testable without a DB.
 */

/** Map a persisted skill row to the public `Skill` DTO. */
export function toSkillDto(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as Skill['type'],
    source: row.source as Skill['source'],
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
  };
}

/** Map a persisted `skill_versions` row to the public `SkillVersion` DTO. */
export function toSkillVersionDto(row: SkillVersionRow): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    message: row.message ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

/** Extract the first `# heading` from markdown text, or undefined. */
function extractMarkdownTitle(text: string): string | undefined {
  const match = text.match(/^#\s+(.+)/m);
  return match?.[1]?.trim();
}

/** Filename stem (no extension, no path). */
function stemFromFilename(filename: string): string {
  const base = filename.split('/').pop() ?? filename;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

/**
 * Parse an uploaded skill file — a bare `.md` or a `.zip` archive — into an
 * import preview. Persists nothing; the caller decides whether to save it.
 *
 * `.zip`: resolves `SKILL.md` first (case-insensitive), else the first
 * top-level `*.md` entry. Every other archive entry is returned in
 * `ignored_files` and is never read as anything but a name — in particular,
 * nothing in the archive is ever executed.
 */
export function parseImport(filename: string, buf: Buffer): SkillImportPreview {
  if (buf.byteLength > MAX_IMPORT_BYTES) {
    throw new ValidationError(
      `File too large: ${buf.byteLength} bytes (max ${MAX_IMPORT_BYTES} bytes)`,
    );
  }

  const lower = filename.toLowerCase();

  if (lower.endsWith('.md')) {
    const text = buf.toString('utf-8');
    const name = extractMarkdownTitle(text) ?? stemFromFilename(filename);
    return {
      name,
      description: '',
      type: 'custom',
      source: 'imported_url',
      body: text,
      ignored_files: [],
    };
  }

  if (lower.endsWith('.zip')) {
    const entries = unzipSync(new Uint8Array(buf));
    const paths = Object.keys(entries);

    const skillMdPath = paths.find((p) => p.toUpperCase() === 'SKILL.MD');
    const firstMdPath =
      skillMdPath ?? paths.find((p) => !p.includes('/') && p.toLowerCase().endsWith('.md'));

    if (!firstMdPath) {
      throw new ValidationError('No .md file found in the zip archive');
    }

    const bodyBytes = entries[firstMdPath];
    if (!bodyBytes) {
      throw new ValidationError(`Could not read ${firstMdPath} from the zip archive`);
    }
    const body = strFromU8(bodyBytes);
    const name = extractMarkdownTitle(body) ?? stemFromFilename(firstMdPath);
    const ignoredFiles = paths.filter((p) => p !== firstMdPath && !p.endsWith('/'));

    return {
      name,
      description: '',
      type: 'custom',
      source: 'imported_url',
      body,
      ignored_files: ignoredFiles,
    };
  }

  throw new ValidationError(
    `Unsupported file type: "${filename}". Only .md and .zip are supported.`,
  );
}
