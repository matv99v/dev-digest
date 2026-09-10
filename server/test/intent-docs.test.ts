import { describe, it, expect } from 'vitest';
import type { RepoRef } from '@devdigest/shared';
import { resolveRepoDocPath } from '../src/modules/intent/helpers.js';
import { loadCandidateDocs } from '../src/modules/intent/doc-loader.js';
import { MAX_DOCS } from '../src/modules/intent/constants.js';
import { MockGitClient } from '../src/adapters/mocks.js';
import type { Container } from '../src/platform/container.js';

/**
 * The security gate (R6) plus the doc-loader's I/O guards (T7). The PR body
 * is fully attacker-controlled and its links drive filesystem reads, so each
 * rejection class gets its OWN case — one combined assertion would still pass
 * with five of the six checks deleted.
 */

const REPO_REF: RepoRef = { owner: 'acme', name: 'payments-api' };

function containerWithGit(git: Partial<MockGitClient> | { readFile: (repo: RepoRef, path: string) => Promise<string> }): Container {
  return { git } as unknown as Container;
}

describe('resolveRepoDocPath — rejections, one class per case', () => {
  it('rejects a URL scheme', () => {
    expect(resolveRepoDocPath('https://example.com/docs/plan.md')).toBeNull();
  });

  it('rejects traversal via ..', () => {
    expect(resolveRepoDocPath('../../etc/passwd')).toBeNull();
  });

  it('rejects an absolute path', () => {
    expect(resolveRepoDocPath('/etc/passwd')).toBeNull();
  });

  it('rejects a non-.md extension inside an allowed root', () => {
    expect(resolveRepoDocPath('docs/x.txt')).toBeNull();
  });

  it('rejects a path outside the doc-root allowlist', () => {
    expect(resolveRepoDocPath('src/index.ts')).toBeNull();
  });

  it('rejects a .. segment that only survives normalization', () => {
    // Normalizes to `../secrets.md` — inside an allowed root before
    // normalization, outside the repo after it.
    expect(resolveRepoDocPath('docs/../../secrets.md')).toBeNull();
  });

  it('rejects a NUL byte', () => {
    expect(resolveRepoDocPath('docs/plan\0.md')).toBeNull();
  });
});

describe('resolveRepoDocPath — acceptances', () => {
  it('accepts a doc under an allowed root', () => {
    expect(resolveRepoDocPath('docs/plans/02-x.md')).toBe('docs/plans/02-x.md');
  });

  it('accepts a ./-prefixed spec and normalizes it', () => {
    expect(resolveRepoDocPath('./specs/y.md')).toBe('specs/y.md');
  });

  it('strips a heading anchor from a root-level markdown file', () => {
    expect(resolveRepoDocPath('README.md#anchor')).toBe('README.md');
  });
});

describe('loadCandidateDocs', () => {
  it('returns the other two docs when the GitClient throws for one candidate', async () => {
    const container = containerWithGit({
      readFile: async (_repo: RepoRef, p: string) => {
        if (p === 'docs/b.md') throw new Error('ENOENT: no such file or directory');
        return `content of ${p}`;
      },
    });

    const docs = await loadCandidateDocs(container, REPO_REF, ['docs/a.md', 'docs/b.md', 'docs/c.md']);

    expect(docs.map((d) => d.path)).toEqual(['docs/a.md', 'docs/c.md']);
  });

  it('skips a candidate the mock port resolves to an empty string', async () => {
    // MockGitClient.readFile RESOLVES to '' for a missing path where the real
    // SimpleGitClient REJECTS — both must be skipped (server/INSIGHTS.md).
    const container = containerWithGit(new MockGitClient({ files: { 'docs/a.md': 'real content' } }));

    const docs = await loadCandidateDocs(container, REPO_REF, ['docs/a.md', 'docs/missing.md']);

    expect(docs.map((d) => d.path)).toEqual(['docs/a.md']);
  });

  it('honours MAX_DOCS when the body carries six valid candidate links', async () => {
    const container = containerWithGit({
      readFile: async (_repo: RepoRef, p: string) => `content of ${p}`,
    });

    const links = ['docs/1.md', 'docs/2.md', 'docs/3.md', 'docs/4.md', 'docs/5.md', 'docs/6.md'];
    const docs = await loadCandidateDocs(container, REPO_REF, links);

    expect(docs).toHaveLength(MAX_DOCS);
  });

  it('never reads a rejected candidate', async () => {
    const attempted: string[] = [];
    const container = containerWithGit({
      readFile: async (_repo: RepoRef, p: string) => {
        attempted.push(p);
        return 'content';
      },
    });

    await loadCandidateDocs(container, REPO_REF, ['../../etc/passwd', 'https://evil.test/x.md', 'docs/ok.md']);

    expect(attempted).toEqual(['docs/ok.md']);
  });
});
