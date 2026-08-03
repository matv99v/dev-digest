import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agents-skills] Docker not available — skipping integration tests.');
}

/**
 * Linking skills to an agent — `POST /agents/:id/skills`'s three body shapes
 * (`skills` with per-link `enabled`, `skill_ids` for a plain ordered set,
 * `skill_id` for a single additive link), reorder, and the per-link `enabled`
 * flag that `run-executor`'s double gate reads.
 */
d('POST /agents/:id/skills (Testcontainers pg)', () => {
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

  async function makeAgent(app: Awaited<ReturnType<typeof makeApp>>) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: `Agent ${Math.random()}`, provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'Review it.' },
    });
    return res.json().id as string;
  }

  async function makeSkill(app: Awaited<ReturnType<typeof makeApp>>, name: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name, type: 'convention', body: `Body of ${name}` },
    });
    return res.json().id as string;
  }

  it('sets the whole ordered set via `skills`, with per-link enabled', async () => {
    const app = await makeApp();
    const agentId = await makeAgent(app);
    const a = await makeSkill(app, 'skill-a');
    const b = await makeSkill(app, 'skill-b');

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skills: [{ skill_id: a, enabled: true }, { skill_id: b, enabled: false }] },
    });
    expect(res.statusCode).toBe(200);
    const links = res.json();
    expect(links).toEqual([
      { agent_id: agentId, skill_id: a, order: 0, enabled: true },
      { agent_id: agentId, skill_id: b, order: 1, enabled: false },
    ]);

    const fetched = (
      await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` })
    ).json();
    expect(fetched).toEqual(links);
    await app.close();
  });

  it('reordering re-sends `skills` in the new order and order updates accordingly', async () => {
    const app = await makeApp();
    const agentId = await makeAgent(app);
    const a = await makeSkill(app, 'reorder-a');
    const b = await makeSkill(app, 'reorder-b');

    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skills: [{ skill_id: a }, { skill_id: b }] },
    });
    const reordered = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skills: [{ skill_id: b }, { skill_id: a }] },
    });
    expect(reordered.json().map((l: { skill_id: string; order: number }) => [l.skill_id, l.order])).toEqual([
      [b, 0],
      [a, 1],
    ]);
    await app.close();
  });

  it('the plain `skill_ids` form defaults every link to enabled', async () => {
    const app = await makeApp();
    const agentId = await makeAgent(app);
    const a = await makeSkill(app, 'ids-a');

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [a] },
    });
    expect(res.json()).toEqual([{ agent_id: agentId, skill_id: a, order: 0, enabled: true }]);
    await app.close();
  });

  it('the single `skill_id` form links additively without disturbing existing links', async () => {
    const app = await makeApp();
    const agentId = await makeAgent(app);
    const a = await makeSkill(app, 'single-a');
    const b = await makeSkill(app, 'single-b');

    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [a] },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_id: b, enabled: false },
    });
    expect(res.statusCode).toBe(200);
    const links = res.json();
    expect(links).toHaveLength(2);
    expect(links.find((l: { skill_id: string }) => l.skill_id === a)).toMatchObject({ enabled: true });
    expect(links.find((l: { skill_id: string }) => l.skill_id === b)).toMatchObject({ enabled: false, order: 1 });
    await app.close();
  });

  it('replacing the set with `skills` unlinks any skill left out of the new list', async () => {
    const app = await makeApp();
    const agentId = await makeAgent(app);
    const a = await makeSkill(app, 'drop-a');
    const b = await makeSkill(app, 'drop-b');

    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skills: [{ skill_id: a }, { skill_id: b }] },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skills: [{ skill_id: b }] },
    });
    expect(res.json()).toEqual([{ agent_id: agentId, skill_id: b, order: 0, enabled: true }]);
    await app.close();
  });

  it('404s for an unknown agent; 422s when neither skills/skill_ids/skill_id is provided', async () => {
    const app = await makeApp();
    const a = await makeSkill(app, 'ghost-agent-skill');
    const ghost = '00000000-0000-0000-0000-000000000000';

    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/agents/${ghost}/skills`,
          payload: { skill_ids: [a] },
        })
      ).statusCode,
    ).toBe(404);

    const agentId = await makeAgent(app);
    expect(
      (await app.inject({ method: 'POST', url: `/agents/${agentId}/skills`, payload: {} }))
        .statusCode,
    ).toBe(422);
    await app.close();
  });
});
