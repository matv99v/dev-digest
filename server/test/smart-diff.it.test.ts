import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockLLMProvider, MockEmbedder } from '../src/adapters/mocks.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[smart-diff] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/** One grounded finding on `src/config.ts` (line 11, inside the diff hunk). */
const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      suggestion: 'Move the key to an environment variable.',
      confidence: 0.95,
      kind: 'finding',
    },
  ],
};

let repoSeq = 0;

/**
 * Seeds a repo + PR, optionally with `pr_files` rows: `src/config.ts` (core),
 * `pnpm-lock.yaml` (boilerplate) and `package.json` (wiring) — one file per
 * role, so a single PR exercises all three groups.
 */
async function setupRepoAndPr(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  opts: { withFiles?: boolean } = {},
) {
  const withFiles = opts.withFiles ?? true;
  const seq = repoSeq++;
  const name = `smart-diff-${seq}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 900 + seq,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: withFiles ? 3 : 0,
      status: 'needs_review',
      body: 'Add rate limiting.',
    })
    .returning();
  if (withFiles) {
    await db.insert(t.prFiles).values([
      {
        prId: pr!.id,
        path: 'src/config.ts',
        additions: 1,
        deletions: 0,
        patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
      },
      { prId: pr!.id, path: 'pnpm-lock.yaml', additions: 200, deletions: 0, patch: null },
      { prId: pr!.id, path: 'package.json', additions: 2, deletions: 0, patch: null },
    ]);
  }
  return { repo: repo!, pr: pr! };
}

/**
 * L03 Smart Diff, over a real Postgres. Covers the response shape (R1, R7),
 * the tenancy boundary (`pr_files`/`findings` carry no `workspace_id` of
 * their own; the gate is one layer up, on `pull_requests`), the local-first
 * posture for a PR whose detail was never fetched, and — the property this
 * feature must never lose — that reading it never calls a model (R4).
 */
d('Smart Diff (L03)', () => {
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
  function appWith() {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: llm },
      },
    });
    return { app, llm };
  }

  it('returns all three groups in role order for a seeded PR with files', async () => {
    const { app } = appWith();
    const a = await app;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await a.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.groups.map((g: { role: string }) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);

    const core = body.groups.find((g: { role: string }) => g.role === 'core');
    const wiring = body.groups.find((g: { role: string }) => g.role === 'wiring');
    const boilerplate = body.groups.find((g: { role: string }) => g.role === 'boilerplate');
    expect(core.files.map((f: { path: string }) => f.path)).toEqual(['src/config.ts']);
    expect(wiring.files.map((f: { path: string }) => f.path)).toEqual(['package.json']);
    expect(boilerplate.files.map((f: { path: string }) => f.path)).toEqual(['pnpm-lock.yaml']);

    await a.close();
  });

  it("every file's pseudocode_summary is null", async () => {
    const { app } = appWith();
    const a = await app;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await a.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    const body = res.json();
    for (const group of body.groups) {
      for (const file of group.files) {
        expect(file.pseudocode_summary).toBeNull();
      }
    }

    await a.close();
  });

  it('a smart-diff read on a never-reviewed PR leaves llm.calls empty', async () => {
    const { app, llm } = appWith();
    const a = await app;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await a.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    expect(llm.calls).toHaveLength(0);

    await a.close();
  });

  it('a smart-diff read after a completed review does not increase llm.calls.length', async () => {
    const { app, llm } = appWith();
    const a = await app;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const agent = (
      await a.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Sec', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();
    await a.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const callsAfterReview = llm.calls.length;
    expect(callsAfterReview).toBeGreaterThan(0);

    await a.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    await a.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(llm.calls).toHaveLength(callsAfterReview);

    await a.close();
  });

  it('404s for a PR in another workspace', async () => {
    const { app } = appWith();
    const a = await app;

    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: 'other-tenant-smart-diff' })
      .returning();
    const { pr: foreignPr } = await setupRepoAndPr(pg.handle.db, otherWs!.id);

    const res = await a.inject({ method: 'GET', url: `/pulls/${foreignPr.id}/smart-diff` });
    expect(res.statusCode).toBe(404);

    await a.close();
  });

  it('a PR whose pr_files rows are absent returns three empty groups, 200, not a 500', async () => {
    const { app } = appWith();
    const a = await app;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, { withFiles: false });

    const res = await a.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      groups: [
        { role: 'core', files: [] },
        { role: 'wiring', files: [] },
        { role: 'boilerplate', files: [] },
      ],
      split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
    });

    await a.close();
  });

  it('findings on a lock-file still leave it in the boilerplate group', async () => {
    const { app } = appWith();
    const a = await app;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    // Insert the review + finding directly (rather than running a real
    // review) so this case doesn't also depend on citation-grounding
    // accepting a finding on a lock-file.
    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr.id, agentId: null, runId: null, kind: 'review', verdict: 'comment' })
      .returning();
    await pg.handle.db.insert(t.findings).values({
      reviewId: review!.id,
      file: 'pnpm-lock.yaml',
      startLine: 1,
      endLine: 1,
      severity: 'SUGGESTION',
      category: 'style',
      title: 'Dependency bump',
      rationale: 'noted',
      confidence: 0.5,
    });

    const res = await a.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const boilerplate = body.groups.find((g: { role: string }) => g.role === 'boilerplate');
    expect(boilerplate.files.map((f: { path: string }) => f.path)).toEqual(['pnpm-lock.yaml']);
    expect(boilerplate.files[0].finding_lines).toEqual([1]);

    await a.close();
  });
});
