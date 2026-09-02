import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ConventionPatch, ConventionSkillDraft, ConventionSkillDraftMode } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';

const SkillDraftQuery = z.object({
  mode: ConventionSkillDraftMode.optional(),
});

const CreateSkillsBody = z.object({
  drafts: z.array(ConventionSkillDraft),
});

/**
 * Conventions Extractor module.
 *   GET  /repos/:id/conventions              → this repo's conventions, shaped as ConventionScan
 *   POST /repos/:id/conventions/extract       → run the scan synchronously, replace this repo's rows
 *   GET  /repos/:id/conventions/skill-draft   → compose ConventionSkillDraft[] from accepted rows
 *   POST /repos/:id/conventions/skills        → create skills from drafts, stamp skill_id back
 *   PATCH /conventions/:id                    → accept / reject / edit one candidate
 *
 * The three `/repos/:id/conventions/...` literal-segment routes are registered
 * BEFORE `/conventions/:id` — same reasoning as `modules/skills/routes.ts:63-64`
 * (a literal segment must precede a uuid-param route sharing its prefix so the
 * literal never gets parsed as the param). They don't actually share a prefix
 * here (`/repos/:id/conventions/*` vs `/conventions/:id`), but the ordering
 * costs nothing and keeps the module consistent with that pattern.
 *
 * SYNCHRONOUS, not a background job: `JobRunner` (platform/jobs.ts) has a hard
 * 120s `timeoutMs` and this codebase has no `GET /jobs/:id` status route — the
 * existing job-polling pattern (repo-intel/routes.ts) polls a domain status
 * table (`repo_index_state`) that has no equivalent here. A synchronous route
 * is simpler, and the DB write happens before the HTTP response returns, so
 * nothing is lost if the client navigates away mid-request.
 */
export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.post('/repos/:id/conventions/extract', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.extract(workspaceId, req.params.id);
  });

  app.get(
    '/repos/:id/conventions/skill-draft',
    { schema: { params: IdParams, querystring: SkillDraftQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.skillDraft(workspaceId, req.params.id, req.query.mode ?? 'merged');
    },
  );

  app.post(
    '/repos/:id/conventions/skills',
    { schema: { params: IdParams, body: CreateSkillsBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const skills = await service.createSkillsFromDrafts(workspaceId, req.body.drafts);
      reply.status(201);
      return skills;
    },
  );

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: ConventionPatch } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const convention = await service.patch(workspaceId, req.params.id, req.body);
      if (!convention) throw new NotFoundError('Convention not found');
      return convention;
    },
  );
}
