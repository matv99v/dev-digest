import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { SkillsRepository } from '../src/modules/skills/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * Skills CRUD + version history — mirrors `agents-versions.it.test.ts`'s
 * coverage shape for the sibling `agent_versions` mechanism: a fresh skill
 * has v1, a body edit appends v2 (with its `message`), metadata-only edits
 * don't bump the version, restore appends a NEW version rather than rewriting
 * history, and everything is workspace-scoped.
 */
d('Skills module (Testcontainers pg)', () => {
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
    name: 'no-then-chains',
    description: 'Always use async/await instead of .then chains.',
    type: 'convention' as const,
    body: '# No Then Chains\n\nUse async/await.',
  };

  it('a new skill has exactly one version (v1) capturing its body', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: createBody });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({
      name: 'no-then-chains',
      type: 'convention',
      source: 'manual',
      body: createBody.body,
      enabled: true,
      version: 1,
    });

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })
    ).json();
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ version: 1, body: createBody.body });
    await app.close();
  });

  it('a body edit bumps the version and records the commit-style message', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;

    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { body: 'new body text', message: 'Tightened the rule' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().version).toBe(2);

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })
    ).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions[0]).toMatchObject({ body: 'new body text', message: 'Tightened the rule' });
    expect(versions[1]).toMatchObject({ body: createBody.body });
    await app.close();
  });

  it('a metadata-only edit (name/description/type/enabled) does NOT bump the version', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;

    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { name: 'renamed-skill', enabled: false },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ name: 'renamed-skill', enabled: false, version: 1 });

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })
    ).json();
    expect(versions).toHaveLength(1);
    await app.close();
  });

  it('restore appends a NEW version instead of rewriting history', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;
    await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}`,
      payload: { body: 'v2 body' },
    });

    const restored = await app.inject({
      method: 'POST',
      url: `/skills/${skillId}/versions/1/restore`,
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({ body: createBody.body, version: 3 });

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skillId}/versions` })
    ).json();
    // History only ever grows: v1 (original) and v2 (edit) both still exist,
    // plus a NEW v3 carrying the restored body and a "Restored v1" message.
    expect(versions.map((v: { version: number }) => v.version)).toEqual([3, 2, 1]);
    expect(versions[0]).toMatchObject({ body: createBody.body, message: 'Restored v1' });
    expect(versions[1]).toMatchObject({ body: 'v2 body' });
    expect(versions[2]).toMatchObject({ body: createBody.body });
    await app.close();
  });

  it('GET /skills/:id/versions/:version returns one snapshot; unknown version 404s', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;

    const v1 = await app.inject({ method: 'GET', url: `/skills/${skillId}/versions/1` });
    expect(v1.statusCode).toBe(200);
    expect(v1.json()).toMatchObject({ version: 1, body: createBody.body });

    const ghostVersion = await app.inject({ method: 'GET', url: `/skills/${skillId}/versions/99` });
    expect(ghostVersion.statusCode).toBe(404);
    await app.close();
  });

  it('DELETE removes the skill; a second delete 404s', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;

    expect((await app.inject({ method: 'DELETE', url: `/skills/${skillId}` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/skills/${skillId}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/skills/${skillId}` })).statusCode).toBe(404);
    await app.close();
  });

  it('stats report DB-only usage — zero agents for a freshly-created, unlinked skill', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json().id as string;

    const stats = await app.inject({ method: 'GET', url: `/skills/${skillId}/stats` });
    expect(stats.statusCode).toBe(200);
    expect(stats.json()).toMatchObject({
      agents_total: 0,
      agents_enabled: 0,
      agents: [],
      versions: 1,
    });
    expect(typeof stats.json().tokens).toBe('number');
    await app.close();
  });

  it('POST /skills/import/preview persists nothing', async () => {
    const app = await makeApp();
    const before = (await app.inject({ method: 'GET', url: '/skills' })).json().length;

    const preview = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'imported.md', content: '# Imported Skill\n\nSome body text.' },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({ name: 'Imported Skill', description: 'Some body text.' });

    const after = (await app.inject({ method: 'GET', url: '/skills' })).json().length;
    expect(after).toBe(before);
    await app.close();
  });

  it('POST /skills/tokens counts tokens without persisting anything', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills/tokens',
      payload: { text: 'Some markdown body text to count.' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().tokens).toBeGreaterThan(0);
    await app.close();
  });

  it('rejects a non-.md import at the parsing edge (422)', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'not-markdown.txt', content: '# Title' },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('skills are workspace-scoped: another tenant cannot read, edit, or delete them', async () => {
    const { db } = pg.handle;
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other-skills' }).returning();
    const repo = new SkillsRepository(db);
    const foreign = await repo.insert({
      workspaceId: otherWs!.id,
      name: 'foreign-skill',
      type: 'custom',
      source: 'manual',
      body: 'foreign body',
    });

    const [{ id: defaultWs }] = await db
      .select({ id: t.workspaces.id })
      .from(t.workspaces)
      .where(eq(t.workspaces.name, 'default'));

    const app = await makeApp();
    // The default-workspace request context (LocalNoAuthProvider) can't see a
    // skill that lives in a different workspace.
    expect((await app.inject({ method: 'GET', url: `/skills/${foreign.id}` })).statusCode).toBe(404);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/skills/${foreign.id}`,
          payload: { name: 'hijacked' },
        })
      ).statusCode,
    ).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/skills/${foreign.id}` })).statusCode).toBe(
      404,
    );
    await app.close();

    expect(defaultWs).not.toBe(otherWs!.id);
  });
});
