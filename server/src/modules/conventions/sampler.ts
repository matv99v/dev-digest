import type { RepoRef } from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import { CONFIG_FILE_CANDIDATES, MAX_FILE_BYTES, SAMPLE_FILE_COUNT } from './constants.js';

/**
 * Code-only sampling for the conventions extractor — zero model calls. Reads a
 * fixed list of config files plus repo-intel's top-ranked source files through
 * the `GitClient` port, so it degrades to `[]` (not a throw) whenever a file is
 * missing/binary or the repo isn't indexed.
 *
 * FORMAT NOTE: `content` on `SampledFile` is the raw, byte-truncated file text
 * — NOT line-numbered. `numberLines()` below produces the "12: const x = 1;"
 * text that actually goes to the model; `content` stays plain so
 * `helpers.ts#verifyCandidates` can index straight into it with the model's
 * cited line numbers with no prefix-stripping step. Both views come from the
 * same truncated string, so line positions always agree between what the
 * model saw and what verification checks against.
 */

export interface SampledFile {
  path: string;
  /** Raw content, truncated to MAX_FILE_BYTES. No line-number prefix. */
  content: string;
}

/** Truncate to at most `maxBytes` UTF-8 bytes (may cut mid-line at the tail). */
export function truncateToBytes(content: string, maxBytes: number): string {
  const buf = Buffer.from(content, 'utf-8');
  if (buf.byteLength <= maxBytes) return content;
  return buf.subarray(0, maxBytes).toString('utf-8');
}

/** Prefix every line with its 1-based line number: "12: const x = 1;". */
export function numberLines(content: string): string {
  return content
    .split('\n')
    .map((line, i) => `${i + 1}: ${line}`)
    .join('\n');
}

/** Read each path through the GitClient port; skip (don't throw) per-file failures. */
async function readSampled(
  container: Container,
  repoRef: RepoRef,
  paths: readonly string[],
): Promise<SampledFile[]> {
  const out: SampledFile[] = [];
  for (const path of paths) {
    try {
      const raw = await container.git.readFile(repoRef, path);
      if (!raw) continue;
      out.push({ path, content: truncateToBytes(raw, MAX_FILE_BYTES) });
    } catch {
      // Missing file, binary content, unreadable clone, etc. — skip it,
      // never fail the whole scan over one file.
    }
  }
  return out;
}

/** Fixed config files — skips any that don't exist. */
export async function sampleConfigFiles(
  container: Container,
  repoRef: RepoRef,
): Promise<SampledFile[]> {
  return readSampled(container, repoRef, CONFIG_FILE_CANDIDATES);
}

/**
 * Top-ranked source files via `container.repoIntel.getConventionSamples` —
 * already drops tests/configs/migrations. Degrades to `[]` when the repo isn't
 * indexed or repo-intel is disabled (best-effort per server/AGENTS.md).
 */
export async function sampleRepoFiles(
  container: Container,
  repoId: string,
  repoRef: RepoRef,
): Promise<SampledFile[]> {
  let paths: string[];
  try {
    paths = await container.repoIntel.getConventionSamples(repoId, SAMPLE_FILE_COUNT);
  } catch {
    return [];
  }
  if (paths.length === 0) return [];
  return readSampled(container, repoRef, paths);
}

/**
 * Render the sampled files as the extraction prompt's user message: each file
 * line-numbered and delimiter-wrapped as untrusted (repo code is
 * attacker-influenceable — someone could add a comment instructing the model
 * to fabricate a convention). Empty input renders an explicit "no files"
 * notice rather than an empty string.
 */
export function renderSampledFilesForPrompt(files: SampledFile[]): string {
  if (files.length === 0) {
    return 'No files were sampled from this repository.';
  }
  return files
    .map((f) => wrapUntrusted(`file:${f.path}`, `${f.path}\n${numberLines(f.content)}`))
    .join('\n\n');
}
