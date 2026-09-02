import { describe, it, expect } from 'vitest';
import {
  numberLines,
  renderSampledFilesForPrompt,
  sampleConfigFiles,
  sampleRepoFiles,
  truncateToBytes,
} from '../src/modules/conventions/sampler.js';
import { MAX_FILE_BYTES } from '../src/modules/conventions/constants.js';
import { MockGitClient } from '../src/adapters/mocks.js';
import type { Container } from '../src/platform/container.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

/**
 * Unit coverage for the conventions module's sampling — no DB, no LLM. Every
 * I/O boundary (`GitClient`, `repoIntel`) is a mock/fake injected via a
 * hand-built container-shaped object, per the onion-architecture testing seam.
 */

const REPO_REF = { owner: 'acme', name: 'payments-api' };

function fakeContainer(opts: {
  files?: Record<string, string>;
  repoIntel?: Partial<RepoIntel>;
}): Container {
  const git = new MockGitClient({ files: opts.files ?? {} });
  return {
    git,
    repoIntel: {
      getConventionSamples: async () => [],
      ...opts.repoIntel,
    } as RepoIntel,
  } as unknown as Container;
}

describe('truncateToBytes', () => {
  it('returns content unchanged when under the cap', () => {
    expect(truncateToBytes('short', 100)).toBe('short');
  });

  it('truncates to at most maxBytes UTF-8 bytes', () => {
    const content = 'a'.repeat(50);
    const truncated = truncateToBytes(content, 10);
    expect(Buffer.byteLength(truncated, 'utf-8')).toBeLessThanOrEqual(10);
    expect(truncated).toBe('a'.repeat(10));
  });

  it('never exceeds MAX_FILE_BYTES for a huge file', () => {
    const huge = 'x'.repeat(MAX_FILE_BYTES * 3);
    const truncated = truncateToBytes(huge, MAX_FILE_BYTES);
    expect(Buffer.byteLength(truncated, 'utf-8')).toBeLessThanOrEqual(MAX_FILE_BYTES);
  });
});

describe('numberLines', () => {
  it('prefixes every line with its 1-based line number', () => {
    expect(numberLines('const x = 1;\nconst y = 2;')).toBe('1: const x = 1;\n2: const y = 2;');
  });

  it('numbers a single-line file as line 1', () => {
    expect(numberLines('only line')).toBe('1: only line');
  });

  it('numbers empty lines too, so line positions stay aligned', () => {
    expect(numberLines('a\n\nb')).toBe('1: a\n2: \n3: b');
  });
});

describe('sampleConfigFiles', () => {
  it('reads the ones that exist and silently skips the ones that do not', async () => {
    const container = fakeContainer({
      files: {
        'package.json': '{"name":"payments-api"}',
        '.eslintrc.json': '{"extends":["base"]}',
        // tsconfig.json, prettier configs, etc. are deliberately absent.
      },
    });
    const files = await sampleConfigFiles(container, REPO_REF);
    const paths = files.map((f) => f.path).sort();
    expect(paths).toEqual(['.eslintrc.json', 'package.json']);
  });

  it('returns [] when none of the candidate config files exist', async () => {
    const container = fakeContainer({ files: {} });
    expect(await sampleConfigFiles(container, REPO_REF)).toEqual([]);
  });

  it('truncates a config file to MAX_FILE_BYTES', async () => {
    const container = fakeContainer({ files: { 'package.json': 'x'.repeat(MAX_FILE_BYTES * 2) } });
    const [file] = await sampleConfigFiles(container, REPO_REF);
    expect(Buffer.byteLength(file!.content, 'utf-8')).toBeLessThanOrEqual(MAX_FILE_BYTES);
  });
});

describe('sampleRepoFiles', () => {
  it('reads the paths repo-intel returns', async () => {
    const container = fakeContainer({
      files: { 'src/api/users.ts': 'export function getUser() {}' },
      repoIntel: { getConventionSamples: async () => ['src/api/users.ts'] },
    });
    const files = await sampleRepoFiles(container, 'repo-1', REPO_REF);
    expect(files).toEqual([{ path: 'src/api/users.ts', content: 'export function getUser() {}' }]);
  });

  it('degrades to [] when getConventionSamples returns nothing (unindexed repo)', async () => {
    const container = fakeContainer({
      files: { 'src/api/users.ts': 'export function getUser() {}' },
      repoIntel: { getConventionSamples: async () => [] },
    });
    expect(await sampleRepoFiles(container, 'repo-1', REPO_REF)).toEqual([]);
  });

  it('degrades to [] (never throws) when getConventionSamples itself rejects', async () => {
    const container = fakeContainer({
      repoIntel: {
        getConventionSamples: async () => {
          throw new Error('repo-intel disabled');
        },
      },
    });
    await expect(sampleRepoFiles(container, 'repo-1', REPO_REF)).resolves.toEqual([]);
  });

  it('skips a path repo-intel names but the clone does not actually have', async () => {
    // MockGitClient.readFile returns '' (never throws) for an unknown path —
    // an empty read is treated the same as "skip this file".
    const container = fakeContainer({
      files: {},
      repoIntel: { getConventionSamples: async () => ['src/missing.ts'] },
    });
    expect(await sampleRepoFiles(container, 'repo-1', REPO_REF)).toEqual([]);
  });
});

describe('renderSampledFilesForPrompt', () => {
  it('renders an explicit notice when there are no sampled files', () => {
    expect(renderSampledFilesForPrompt([])).toMatch(/no files/i);
  });

  it('line-numbers each file and includes its path', () => {
    const rendered = renderSampledFilesForPrompt([
      { path: 'src/config.ts', content: 'const a = 1;\nconst b = 2;' },
    ]);
    expect(rendered).toContain('src/config.ts');
    expect(rendered).toContain('1: const a = 1;');
    expect(rendered).toContain('2: const b = 2;');
  });
});
