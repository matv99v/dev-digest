import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

/**
 * The sampled file the fake repo-intel points `getConventionSamples` at and
 * the fake GitClient actually has content for. Line numbers below are 1-based
 * against this exact string.
 */
const USERS_TS = [
  'import { db } from "./db";', // 1
  '', // 2
  'export async function getUser(id: string) {', // 3
  '  const user = await db.users.find(id);', // 4
  '  return user;', // 5
  '}', // 6
].join('\n');

/** Minimal RepoIntel fake — only getConventionSamples matters for this module. */
function fakeRepoIntel(samples: string[]): RepoIntel {
  return {
    indexRepo: async () => ({ status: 'degraded', filesIndexed: 0, filesSkipped: 0, durationMs: 0 }),
    refreshIndex: async () => ({ status: 'degraded', filesIndexed: 0, filesSkipped: 0, durationMs: 0 }),
    getIndexState: async () => ({
      repoId: '',
      lastIndexedSha: '',
      indexerVersion: 0,
      updatedAt: new Date(),
      status: 'degraded',
      filesIndexed: 0,
      filesSkipped: 0,
      durationMs: 0,
    }),
    getBlastRadius: async () => ({ changedSymbols: [], callers: [], impactedEndpoints: [] }),
    getRepoMap: async () => ({ text: '', tokens: 0, cached: false }),
    getFileRank: async () => [],
    getSymbolsInFiles: async () => [],
    getCallerSignatures: async () => [],
    getUnresolvedReferences: async () => [],
    getConventionSamples: async () => samples,
    getTopFilesByRank: async () => [],
    getCriticalPaths: async () => [],
  };
}

/** One verified-and-kept, one verified-and-kept (left pending), one dropped (nonexistent file). */
const EXTRACTION_FIXTURE = [
  {
    rule: 'Always use async/await instead of .then() chains.',
    category: 'async-await',
    evidence_path: 'src/api/users.ts',
    evidence_line_start: 4,
    evidence_line_end: 4,
    evidence_snippet: 'const user = await db.users.find(id);',
    confidence: 0.9,
  },
  {
    rule: 'Return the fetched entity directly, no wrapping object.',
    category: 'return-style',
    evidence_path: 'src/api/users.ts',
    evidence_line_start: 5,
    evidence_line_end: 5,
    evidence_snippet: 'return user;',
    confidence: 0.6,
  },
  {
    rule: 'A hallucinated convention citing a file that was never sampled.',
    category: 'made-up',
    evidence_path: 'src/does/not/exist.ts',
    evidence_line_start: 1,
    evidence_line_end: 1,
    evidence_snippet: 'this file does not exist',
    confidence: 0.99,
  },
];

/**
 * L02 — Conventions Extractor, over a real Postgres. Covers: extract persists
 * only verified candidates (a fixture candidate citing a nonexistent file is
 * dropped), PATCH flips a candidate's status, skill-draft excludes
 * rejected/pending rows, and POST .../skills creates a skill + stamps
 * skill_id back onto the source convention rows.
 */
d('Conventions Extractor', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [repo] = await pg.handle.db
      .select({ id: t.repos.id })
      .from(t.repos)
      .where(eq(t.repos.fullName, 'acme/payments-api'));
    repoId = repo!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ files: { 'src/api/users.ts': USERS_TS }, head: 'deadbeef123' }),
        repoIntel: fakeRepoIntel(['src/api/users.ts']),
        llm: {
          openai: new MockLLMProvider('openai', {
            structuredBySchema: { ConventionExtraction: EXTRACTION_FIXTURE },
          }),
        },
      },
    });
  }

  it('POST /repos/:id/conventions/extract persists only verified candidates', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    expect(res.statusCode).toBe(200);

    const scan = res.json();
    expect(scan.candidates).toHaveLength(2);
    expect(scan.dropped_unverified).toBe(1);
    expect(scan.scanned_sha).toBe('deadbeef123');
    expect(scan.candidates.some((c: { evidence: { path: string } }) => c.evidence.path === 'src/does/not/exist.ts')).toBe(false);

    // Persisted rows are replaced, not appended — a re-scan wouldn't accumulate.
    const list = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(list.json().candidates).toHaveLength(2);
    expect(list.json().candidates.every((c: { status: string }) => c.status === 'pending')).toBe(true);

    await app.close();
  });

  it('PATCH /conventions/:id flips status; skill-draft only ever includes accepted rows', async () => {
    const app = await makeApp();
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });

    const list = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
    const candidates: { id: string; rule: string }[] = list.candidates;
    const toAccept = candidates.find((c) => c.rule.startsWith('Always use async/await'))!;
    const toLeavePending = candidates.find((c) => c.rule.startsWith('Return the fetched'))!;

    const patched = await app.inject({
      method: 'PATCH',
      url: `/conventions/${toAccept.id}`,
      payload: { status: 'accepted' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().status).toBe('accepted');

    const draftRes = await app.inject({
      method: 'GET',
      url: `/repos/${repoId}/conventions/skill-draft?mode=merged`,
    });
    expect(draftRes.statusCode).toBe(200);
    const drafts = draftRes.json();
    expect(drafts).toHaveLength(1);
    expect(drafts[0].convention_ids).toEqual([toAccept.id]);
    expect(drafts[0].convention_ids).not.toContain(toLeavePending.id);
    expect(drafts[0].body).toContain('Always use async/await');
    expect(drafts[0].body).not.toContain('Return the fetched entity');

    await app.close();
  });

  it('PATCH can reject a candidate, which then never reaches a skill draft', async () => {
    const app = await makeApp();
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const list = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
    const candidates: { id: string }[] = list.candidates;

    for (const c of candidates) {
      await app.inject({ method: 'PATCH', url: `/conventions/${c.id}`, payload: { status: 'rejected' } });
    }

    const draftRes = await app.inject({
      method: 'GET',
      url: `/repos/${repoId}/conventions/skill-draft?mode=merged`,
    });
    expect(draftRes.json()).toEqual([]);

    await app.close();
  });

  it('POST /repos/:id/conventions/skills creates a skill and stamps skill_id back onto its source rows', async () => {
    const app = await makeApp();
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const list = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
    const toAccept = list.candidates.find((c: { rule: string }) => c.rule.startsWith('Always use async/await'));

    await app.inject({
      method: 'PATCH',
      url: `/conventions/${toAccept.id}`,
      payload: { status: 'accepted' },
    });

    const draftRes = await app.inject({
      method: 'GET',
      url: `/repos/${repoId}/conventions/skill-draft?mode=merged`,
    });
    const drafts = draftRes.json();
    expect(drafts).toHaveLength(1);

    const createRes = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skills`,
      payload: { drafts },
    });
    expect(createRes.statusCode).toBe(201);
    const skills = createRes.json();
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({ type: 'convention', source: 'extracted' });
    expect(skills[0].evidence_files).toEqual(['src/api/users.ts']);

    const [conventionRow] = await pg.handle.db
      .select({ skillId: t.conventions.skillId })
      .from(t.conventions)
      .where(eq(t.conventions.id, toAccept.id));
    expect(conventionRow!.skillId).toBe(skills[0].id);

    await app.close();
  });

  it('is workspace-scoped: extract on a foreign workspace repo does not affect the default workspace', async () => {
    const { db } = pg.handle;
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other-conventions-ws' }).returning();
    const [otherRepo] = await db
      .insert(t.repos)
      .values({
        workspaceId: otherWs!.id,
        owner: 'other',
        name: 'other-repo',
        fullName: 'other/other-repo',
      })
      .returning();

    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: `/repos/${otherRepo!.id}/conventions/extract`,
    });
    // LocalNoAuthProvider always resolves the default workspace, so a repo id
    // from another workspace is simply not found under that tenancy scope.
    expect(res.statusCode).toBe(404);

    // The default workspace's own repo is untouched.
    const list = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(list.statusCode).toBe(200);

    await app.close();
  });
});
