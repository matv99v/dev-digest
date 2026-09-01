import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { SkillsService } from '../src/modules/skills/service.js';
import type { Container } from '../src/platform/container.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * L02 — Skills CRUD module, over a real Postgres. Covers: create writes v1,
 * a body-changing update bumps version (a metadata-only update does not),
 * version history + restore, delete, import-preview persisting nothing, and
 * workspace isolation.
 */
d('Skills CRUD', () => {
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
    name: 'Uncovered branches (test fixture)',
    type: 'rubric' as const,
    body: '# v1 body',
  };

  it('POST /skills creates a skill at version 1', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/skills', payload: createBody });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      name: createBody.name,
      type: 'rubric',
      source: 'manual',
      body: '# v1 body',
      enabled: true,
      version: 1,
    });
    await app.close();
  });

  it('changing body bumps the version; changing only metadata does not', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;

    const metaOnly = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { name: 'Renamed, same body', enabled: false },
    });
    expect(metaOnly.statusCode).toBe(200);
    expect(metaOnly.json().version).toBe(1);

    const bodyChange = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { body: '# v2 body' },
    });
    expect(bodyChange.statusCode).toBe(200);
    expect(bodyChange.json().version).toBe(2);
    await app.close();
  });

  it('GET /skills/:id/versions lists both versions, newest first', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;
    await app.inject({ method: 'PUT', url: `/skills/${skillId}`, payload: { body: '# v2 body' } });

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })
    ).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions[1].body).toBe('# v1 body');
    expect(versions[0].body).toBe('# v2 body');
    await app.close();
  });

  it('POST /skills/:id/restore restores an old body as a new version', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;
    await app.inject({ method: 'PUT', url: `/skills/${skillId}`, payload: { body: '# v2 body' } });

    const restored = await app.inject({
      method: 'POST',
      url: `/skills/${skillId}/restore`,
      payload: { version: 1 },
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({ body: '# v1 body', version: 3 });

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })
    ).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([3, 2, 1]);
    expect(versions[0].body).toBe('# v1 body');
    await app.close();
  });

  it('DELETE /skills/:id removes it; a later GET 404s', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;

    const del = await app.inject({ method: 'DELETE', url: `/skills/${skillId}` });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ ok: true });

    const after = await app.inject({ method: 'GET', url: `/skills/${skillId}` });
    expect(after.statusCode).toBe(404);
    await app.close();
  });

  it('POST /skills/import returns a preview and persists nothing', async () => {
    const app = await makeApp();
    const before = (await app.inject({ method: 'GET', url: '/skills' })).json() as unknown[];

    const md = '# No then-chains\n\nUse async/await instead of .then chains.\n';
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: {
        filename: 'no-then-chains.md',
        content_base64: Buffer.from(md, 'utf-8').toString('base64'),
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      name: 'No then-chains',
      source: 'imported_url',
      ignored_files: [],
    });

    const after = (await app.inject({ method: 'GET', url: '/skills' })).json() as unknown[];
    expect(after.length).toBe(before.length);
    await app.close();
  });

  it('is workspace-scoped: a skill in another workspace is invisible to the default one', async () => {
    const { db } = pg.handle;
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other-skills-ws' }).returning();
    const service = new SkillsService({ db } as unknown as Container);
    const foreign = await service.create(otherWs!.id, {
      name: 'Foreign skill',
      type: 'custom',
      body: '# foreign',
    });

    const [{ id: defaultWs }] = await db
      .select({ id: t.workspaces.id })
      .from(t.workspaces)
      .where(eq(t.workspaces.name, 'default'));

    // Owner workspace can read/write/version/restore/delete it.
    expect(await service.get(otherWs!.id, foreign.id)).toBeDefined();
    expect(await service.listVersions(otherWs!.id, foreign.id)).toHaveLength(1);

    // A different workspace gets undefined everywhere (route maps that to 404).
    expect(await service.get(defaultWs!, foreign.id)).toBeUndefined();
    expect(await service.update(defaultWs!, foreign.id, { body: '# hijacked' })).toBeUndefined();
    expect(await service.listVersions(defaultWs!, foreign.id)).toBeUndefined();
    expect(await service.restore(defaultWs!, foreign.id, 1)).toBeUndefined();
    expect(await service.stats(defaultWs!, foreign.id)).toBeUndefined();
    expect(await service.delete(defaultWs!, foreign.id)).toBe(false);

    // The foreign skill's body is untouched by the failed cross-tenant update.
    expect((await service.get(otherWs!.id, foreign.id))?.body).toBe('# foreign');
  });
});
