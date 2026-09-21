/**
 * L04 Blast Radius — the HTTP surface, over a real Postgres (R1, R6, R8, R15).
 *
 * `repo-intel-blast.it.test.ts` already proves the persistent SQL (R2-R4) and
 * `blast-helpers.test.ts` the pure mapping (R5, R14). This file is the one
 * layer neither covers: the route, the tenancy gate, the "never touches the
 * code index or git on a full index" property, and the Explain cache
 * round-trip (exactly one model call, never on GET, never twice at the same
 * shas).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { INDEXER_VERSION } from '../src/modules/repo-intel/constants.js';
import { PrBlastRadius } from '@devdigest/shared';
import type { CodeIndex, GitClient } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[blast] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const FILE = 'src/payments/limiter.ts';
const CALLER = 'src/routes/payments.ts';
const SYMBOL_NAME = 'applyLimit';
const INDEX_SHA = 'indexsha1';

/** Every method throws — proves the persistent path never reaches either port (R6). */
function throwingCodeIndex(): CodeIndex {
  const boom = async (): Promise<never> => {
    throw new Error('codeIndex must not be called on a fully-indexed repo');
  };
  return { grep: boom, symbols: boom, references: boom };
}

function throwingGitClient(): GitClient {
  const boom = async (): Promise<never> => {
    throw new Error('git must not be called on a fully-indexed repo');
  };
  return {
    clone: boom,
    fetchPullHead: boom,
    sync: boom,
    currentHead: boom,
    diff: boom,
    diffNameOnly: boom,
    blame: boom,
    log: boom,
    readFile: boom,
    clonePathFor: () => {
      throw new Error('git must not be called on a fully-indexed repo');
    },
  };
}

let repoSeq = 0;

/**
 * Seeds a repo + PR + (optionally) a fully-indexed repo-intel fixture: one
 * changed file declaring `applyLimit`, one real caller with a real
 * `file_rank` row, so `changed_symbols` and `callers` are both non-empty.
 */
async function setupRepoAndPr(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  opts: { indexed?: boolean; withFiles?: boolean; headSha?: string } = {},
) {
  const indexed = opts.indexed ?? true;
  const withFiles = opts.withFiles ?? true;
  const seq = repoSeq++;
  const name = `blast-${seq}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 700 + seq,
      title: 'Tighten the payments rate limiter',
      author: 'marisa.koch',
      branch: 'feat/limiter',
      base: 'main',
      headSha: opts.headSha ?? 'headsha1',
      additions: 3,
      deletions: 1,
      filesCount: withFiles ? 1 : 0,
      status: 'needs_review',
      body: 'Tighten the payments rate limiter.',
    })
    .returning();

  if (withFiles) {
    await db.insert(t.prFiles).values({
      prId: pr!.id,
      path: FILE,
      additions: 3,
      deletions: 1,
      patch: null,
    });
  }

  if (indexed) {
    await db.insert(t.repoIndexState).values({
      repoId: repo!.id,
      lastIndexedSha: INDEX_SHA,
      indexerVersion: INDEXER_VERSION,
      status: 'full',
      filesIndexed: 2,
      filesSkipped: 0,
      stats: {},
    });
    await db.insert(t.symbols).values({
      repoId: repo!.id,
      path: FILE,
      name: SYMBOL_NAME,
      kind: 'function',
      line: 5,
      endLine: 20,
      exported: true,
    });
    await db.insert(t.fileRank).values([
      { repoId: repo!.id, filePath: FILE, pagerank: 0.5, hotness: 0, rank: 10, percentile: 90 },
      { repoId: repo!.id, filePath: CALLER, pagerank: 0.5, hotness: 0, rank: 5, percentile: 80 },
    ]);
    await db.insert(t.references).values({
      repoId: repo!.id,
      fromPath: CALLER,
      toSymbol: SYMBOL_NAME,
      line: 12,
      declFile: FILE,
    });
  }

  return { repo: repo!, pr: pr! };
}

d('Blast Radius (L04)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  /** `llm` is returned so a test can inspect `.calls` after the request. */
  function appWith(opts: { completionText?: string; codeIndex?: CodeIndex; git?: GitClient } = {}) {
    const llm = new MockLLMProvider('openai', { completionText: opts.completionText ?? 'Explain paragraph.' });
    const app = buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        llm: { openai: llm },
        ...(opts.codeIndex ? { codeIndex: opts.codeIndex } : {}),
        ...(opts.git ? { git: opts.git } : {}),
      },
    });
    return { app, llm };
  }

  /** `complete()` calls only — a review (`completeStructured`) must never
   *  pollute this count, mirroring `intent.it.test.ts`'s schema-filtered helper. */
  function explainCalls(llm: MockLLMProvider) {
    return llm.calls.filter((c) => c.method === 'complete');
  }

  it('returns 200 and a parseable PrBlastRadius for an indexed repo (R1)', async () => {
    const { app } = appWith();
    const a = await app;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await a.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);

    const parsed = PrBlastRadius.safeParse(res.json());
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error('unreachable');
    expect(parsed.data.status).toBe('indexed');
    expect(parsed.data.indexed_sha).toBe(INDEX_SHA);
    expect(parsed.data.changed_symbols).toEqual(
      expect.arrayContaining([{ name: SYMBOL_NAME, file: FILE, kind: 'function' }]),
    );

    await a.close();
  });

  it('404s with the not_found envelope for a PR in another workspace, before any pr_files or repo-intel row is read (R1)', async () => {
    const { app } = appWith();
    const a = await app;

    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-tenant-blast' }).returning();
    const { pr: foreignPr } = await setupRepoAndPr(pg.handle.db, otherWs!.id);

    const res = await a.inject({ method: 'GET', url: `/pulls/${foreignPr.id}/blast` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');

    await a.close();
  });

  it('a blast read on a fully-indexed repo touches neither the code-index nor the git port (R6)', async () => {
    const { app } = appWith({ codeIndex: throwingCodeIndex(), git: throwingGitClient() });
    const a = await app;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await a.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('indexed');
    expect(body.changed_symbols.length).toBeGreaterThan(0);

    await a.close();
  });

  it('two GETs leave llm.calls empty (R8)', async () => {
    const { app, llm } = appWith();
    const a = await app;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    await a.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    await a.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(explainCalls(llm)).toHaveLength(0);

    await a.close();
  });

  it('one POST adds exactly one llm call; a second POST at the same head and index sha adds none (R8)', async () => {
    const { app, llm } = appWith();
    const a = await app;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const first = await a.inject({ method: 'POST', url: `/pulls/${pr.id}/blast/explain` });
    expect(first.statusCode).toBe(200);
    expect(explainCalls(llm)).toHaveLength(1);
    const firstBody = first.json();
    expect(firstBody.explanation?.text).toBe('Explain paragraph.');

    const second = await a.inject({ method: 'POST', url: `/pulls/${pr.id}/blast/explain` });
    expect(second.statusCode).toBe(200);
    expect(explainCalls(llm)).toHaveLength(1);
    expect(second.json().explanation?.text).toBe(firstBody.explanation.text);

    await a.close();
  });

  it('a POST on a repo with status none makes no row and no call, explanation stays null', async () => {
    const { app, llm } = appWith();
    const a = await app;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, { indexed: false });

    const res = await a.inject({ method: 'POST', url: `/pulls/${pr.id}/blast/explain` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('none');
    expect(body.explanation).toBeNull();
    expect(explainCalls(llm)).toHaveLength(0);

    const [row] = await pg.handle.db.select().from(t.prBlastSummary).where(eq(t.prBlastSummary.prId, pr.id));
    expect(row).toBeUndefined();

    await a.close();
  });

  it('a PR whose pr_files rows are absent returns 200 with status set and empty arrays, not a 500', async () => {
    const { app } = appWith();
    const a = await app;
    // A real full index exists, but this PR itself carries no `pr_files`
    // rows — `status` still reflects the INDEX's own trustworthiness
    // (`mapStatus` is driven by `getIndexState()`, not by whether this
    // particular request happened to have any changed files), so this must
    // NOT collapse to 'none'; that would be exactly the "empty data reads as
    // not-indexed" confusion R5 exists to prevent.
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, { withFiles: false, indexed: true });

    const res = await a.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('indexed');
    expect(body.changed_symbols).toEqual([]);
    expect(body.downstream).toEqual([]);

    await a.close();
  });

  it('deleting the pull request removes its pr_blast_summary row (R15)', async () => {
    const { app } = appWith();
    const a = await app;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    await a.inject({ method: 'POST', url: `/pulls/${pr.id}/blast/explain` });
    const [before] = await pg.handle.db.select().from(t.prBlastSummary).where(eq(t.prBlastSummary.prId, pr.id));
    expect(before).toBeDefined();

    await pg.handle.db.delete(t.pullRequests).where(eq(t.pullRequests.id, pr.id));

    const [after] = await pg.handle.db.select().from(t.prBlastSummary).where(eq(t.prBlastSummary.prId, pr.id));
    expect(after).toBeUndefined();

    await a.close();
  });
});
