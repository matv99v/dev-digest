import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockLLMProvider, MockEmbedder } from '../src/adapters/mocks.js';
import { INTENT_DERIVATION_SCHEMA_NAME } from '../src/modules/intent/constants.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[intent] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'comment',
  summary: 'Looks fine.',
  score: 90,
  findings: [],
};

/** Satisfies `RawIntent` — exactly the three fields, no confidence. */
const INTENT_FIXTURE = {
  intent: 'Add rate limiting to the payments API.',
  in_scope: ['src/config.ts', 'rate limiting middleware'],
  out_of_scope: ['src/never-touched.ts'],
};

let repoSeq = 0;
async function setupRepoAndPr(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  overrides: { body?: string; headSha?: string } = {},
) {
  const name = `payments-api-intent-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: overrides.headSha ?? 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      // Long enough to clear MIN_BODY_PROSE_CHARS (120) after stripBodyNoise,
      // so the `pr_body` source is recorded and confidence lands on `medium`.
      body:
        overrides.body ??
        'Add rate limiting so the API stops falling over under burst traffic. ' +
          'The limiter is configured per route and keyed on the caller API key, ' +
          'with the burst window read from config rather than hard-coded.',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

/**
 * L03 — PR Intent Layer, over a real Postgres. Covers the cache round-trip,
 * the tenancy boundary (the table carries no `workspace_id`, so the gate is
 * one layer up and must be proven), the executor's reuse-vs-derive decision,
 * the best-effort invariant, and the cost-accounting split (R11).
 */
d('PR Intent Layer', () => {
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

  /** `llm` is returned so a test can inspect `.calls` after the run. */
  function appWith(opts: { intentFixture?: unknown } = {}) {
    const llm = new MockLLMProvider('openai', {
      structured: REVIEW_FIXTURE,
      ...(opts.intentFixture !== undefined
        ? { structuredBySchema: { [INTENT_DERIVATION_SCHEMA_NAME]: opts.intentFixture } }
        : {}),
    });
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

  function intentDerivationCalls(llm: MockLLMProvider) {
    return llm.calls.filter(
      (c) =>
        c.method === 'completeStructured' &&
        (c.req as { schemaName?: string }).schemaName === INTENT_DERIVATION_SCHEMA_NAME,
    );
  }

  it('POST then GET round-trips every persisted column', async () => {
    const { app } = appWith({ intentFixture: INTENT_FIXTURE });
    const a = await app;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const posted = await a.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(posted.statusCode).toBe(200);
    const derived = posted.json();
    expect(derived.intent).toBe(INTENT_FIXTURE.intent);
    expect(derived.confidence).toBe('medium');
    expect(derived.derived_from_sha).toBe('a1b2c3d4');
    expect(derived.provider).toBe('openai');
    expect(derived.stale).toBe(false);
    // R5 — the ungrounded out-of-scope path was dropped before persistence.
    expect(derived.out_of_scope).toEqual([]);
    expect(derived.in_scope).toContain('src/config.ts');

    const read = await a.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toEqual(derived);

    // Tokens/cost land on the pr_intent row itself (R11).
    const [row] = await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, pr.id));
    expect(row!.tokensIn).toBe(100);
    expect(row!.tokensOut).toBe(50);
    expect(row!.costUsd).toBeCloseTo(0.001, 6);
    expect(row!.model).toBe('gpt-4.1');

    await a.close();
  });

  it('GET returns a null body, not a 404, when nothing has been derived yet', async () => {
    const { app } = appWith({ intentFixture: INTENT_FIXTURE });
    const a = await app;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await a.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();

    await a.close();
  });

  it('GET 404s for a PR outside the callers workspace', async () => {
    const { app } = appWith({ intentFixture: INTENT_FIXTURE });
    const a = await app;

    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: 'other-tenant' })
      .returning();
    const { pr: foreignPr } = await setupRepoAndPr(pg.handle.db, otherWs!.id);

    const res = await a.inject({ method: 'GET', url: `/pulls/${foreignPr.id}/intent` });
    expect(res.statusCode).toBe(404);

    // The gate is one layer up (getPull), so nothing was written either.
    const rows = await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, foreignPr.id));
    expect(rows).toHaveLength(0);

    await a.close();
  });

  it('a review run reuses a fresh cached intent with zero derivation calls', async () => {
    const { app, llm } = appWith({ intentFixture: INTENT_FIXTURE });
    const a = await app;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    // Prime the cache at the PR's current head.
    await a.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(intentDerivationCalls(llm)).toHaveLength(1);

    const agent = (
      await a.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Sec', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();
    await a.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    // Still exactly the one call from the priming POST — the run reused it.
    expect(intentDerivationCalls(llm)).toHaveLength(1);

    await a.close();
  });

  it('a derivation failure never fails the run: every run reaches done, the prompt has no Intent, the log line is info', async () => {
    // No IntentDerivation fixture at all — the mock falls back to REVIEW_FIXTURE,
    // which fails `RawIntent.safeParse`, so the derive throws inside the service.
    const { app } = appWith();
    const a = await app;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const agent = (
      await a.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Sec', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();
    const res = await a.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    const runId = res.json().runs[0].run_id;

    const runs = await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    expect(runs.every((r) => r.status === 'done')).toBe(true);

    const trace = (await a.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.prompt_assembly.intent ?? null).toBeNull();

    // The failure is reported, and reported as `info` — never as an `error`
    // event, which would paint the Live Log red on a benign degradation.
    const intentLines = (trace.log as { kind: string; msg: string }[]).filter((l) =>
      l.msg.startsWith('intent:'),
    );
    expect(intentLines.some((l) => l.msg.includes('derivation failed'))).toBe(true);
    expect(intentLines.every((l) => l.kind !== 'error')).toBe(true);

    await a.close();
  });

  it('intent tokens are recorded on pr_intent and never folded into the agent run', async () => {
    const { app } = appWith({ intentFixture: INTENT_FIXTURE });
    const a = await app;
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const agent = (
      await a.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Sec', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();
    const res = await a.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    const runId = res.json().runs[0].run_id;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    // The review call's tokens alone — 100, not 200 (which is what folding the
    // shared derive call into the per-agent row would produce).
    expect(run!.tokensIn).toBe(100);
    expect(run!.costUsd).toBeCloseTo(0.001, 6);

    const [intentRow] = await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, pr.id));
    expect(intentRow!.tokensIn).toBe(100);

    await a.close();
  });
});
