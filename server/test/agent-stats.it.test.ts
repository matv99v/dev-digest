import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agent-stats] Docker not available — skipping integration tests.');
}

/**
 * GET /agents/stats + GET /agents/:id/stats — the Stats-tab aggregation
 * built on real `agent_runs` / `reviews` / `findings` rows (not the pure
 * helpers, which are covered without a DB in agent-stats.test.ts). Covers:
 * a fresh agent reads as zero/null (never 0%/$0.00), a real run + finding
 * feed every field, and the 404 on an unknown agent.
 */
d('GET /agents/stats, GET /agents/:id/stats', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  const createBody = {
    name: 'Stats Fixture Agent',
    provider: 'openai' as const,
    model: 'gpt-4o-mini',
    system_prompt: 'Review the diff.',
  };

  it('an agent with no runs reads as zero/null, never 0%/$0.00', async () => {
    const app = await makeApp();
    const agentId = (
      await app.inject({ method: 'POST', url: '/agents', payload: createBody })
    ).json().id as string;

    const res = await app.inject({ method: 'GET', url: `/agents/${agentId}/stats` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      agent_id: agentId,
      runs_30d: 0,
      accept_rate: null,
      avg_cost_usd: null,
      avg_cost_delta: null,
      avg_duration_ms: null,
      findings_last_30d: 0,
      findings_by_category: {},
      runs: [],
    });

    const summaries = (await app.inject({ method: 'GET', url: '/agents/stats' })).json() as {
      agent_id: string;
    }[];
    expect(summaries.find((s) => s.agent_id === agentId)).toMatchObject({
      agent_id: agentId,
      runs_30d: 0,
      accept_rate: null,
      avg_cost_usd: null,
    });
    await app.close();
  });

  it('404s for an unknown agent', async () => {
    const app = await makeApp();
    const ghost = '00000000-0000-0000-0000-000000000000';
    expect((await app.inject({ method: 'GET', url: `/agents/${ghost}/stats` })).statusCode).toBe(
      404,
    );
    await app.close();
  });

  it('aggregates a real run + review + findings', async () => {
    const app = await makeApp();
    const { db } = pg.handle;
    const agentId = (
      await app.inject({ method: 'POST', url: '/agents', payload: createBody })
    ).json().id as string;

    const [workspace] = await db.select().from(t.workspaces).limit(1);
    const workspaceId = workspace!.id;

    const repoName = `payments-api-stats-${Date.now()}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: repoName, fullName: `acme/${repoName}` })
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
        headSha: 'a1b2c3d4',
      })
      .returning();

    const [run] = await db
      .insert(t.agentRuns)
      .values({
        workspaceId,
        agentId,
        prId: pr!.id,
        provider: 'openai',
        model: 'gpt-4o-mini',
        durationMs: 6200,
        tokensIn: 12000,
        tokensOut: 4000,
        costUsd: 0.06,
        status: 'done',
        source: 'local',
        findingsCount: 2,
      })
      .returning();

    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        agentId,
        runId: run!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary: 'x',
        score: 70,
      })
      .returning();

    await db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 11,
        endLine: 11,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded key',
        rationale: 'x',
        confidence: 0.9,
        acceptedAt: new Date(),
      },
      {
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 20,
        endLine: 20,
        severity: 'WARNING',
        category: 'bug',
        title: 'Off-by-one',
        rationale: 'x',
        confidence: 0.6,
        dismissedAt: new Date(),
      },
    ]);

    const res = await app.inject({ method: 'GET', url: `/agents/${agentId}/stats` });
    expect(res.statusCode).toBe(200);
    const stats = res.json();
    expect(stats).toMatchObject({
      agent_id: agentId,
      runs_30d: 1,
      accept_rate: 0.5,
      avg_cost_usd: 0.06,
      findings_last_30d: 2,
      findings_by_category: { security: 1, bug: 1 },
    });
    expect(stats.runs).toHaveLength(1);
    expect(stats.runs[0]).toMatchObject({
      run_id: run!.id,
      repo_id: repo!.id,
      pr_number: 482,
      cost_usd: 0.06,
      source: 'local',
      status: 'done',
    });
    expect(stats.runs_trend).toHaveLength(30);
    expect(stats.runs_trend.reduce((a: number, b: number) => a + b, 0)).toBe(1);
    expect(Array.isArray(stats.findings_by_severity_weekly)).toBe(true);
    const totalCritical = stats.findings_by_severity_weekly.reduce(
      (sum: number, w: { critical: number }) => sum + w.critical,
      0,
    );
    expect(totalCritical).toBe(1);

    const summaries = (await app.inject({ method: 'GET', url: '/agents/stats' })).json() as {
      agent_id: string;
      runs_30d: number;
      accept_rate: number | null;
      avg_cost_usd: number | null;
    }[];
    expect(summaries.find((s) => s.agent_id === agentId)).toMatchObject({
      agent_id: agentId,
      runs_30d: 1,
      accept_rate: 0.5,
      avg_cost_usd: 0.06,
    });
    await app.close();
  });

  it('stats are workspace-scoped: another tenant cannot read them', async () => {
    const app = await makeApp();
    const { db } = pg.handle;
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other-stats' }).returning();
    const [foreign] = await db
      .insert(t.agents)
      .values({
        workspaceId: otherWs!.id,
        name: 'Foreign',
        provider: 'openai',
        model: 'gpt-4o-mini',
        systemPrompt: 'x',
      })
      .returning();

    const res = await app.inject({ method: 'GET', url: `/agents/${foreign!.id}/stats` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
