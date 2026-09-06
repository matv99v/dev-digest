import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { PrIntentDetail } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { IntentService } from './service.js';

/**
 * PR Intent Layer module (L03).
 *   GET  /pulls/:id/intent  → the cached intent, or `null` — NEVER derives,
 *                             and NEVER 404s on "no intent yet" (only on a PR
 *                             outside the caller's workspace). A null body,
 *                             not a 404, so the card's empty state needs no
 *                             error branch.
 *   POST /pulls/:id/intent  → always (re-)derives and upserts.
 *
 * SYNCHRONOUS, not a background job — same recorded rationale as
 * `conventions/routes.ts`: `JobRunner` has a hard 120s `timeoutMs` and this
 * codebase has no `GET /jobs/:id` status route; `DERIVE_TIMEOUT_MS`
 * (constants.ts) sits well under that cap, so a synchronous route is simpler
 * and nothing is lost if the client navigates away mid-request.
 */
export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new IntentService(app.container);

  app.get('/pulls/:id/intent', { schema: { params: IdParams } }, async (req): Promise<PrIntentDetail | null> => {
    const { workspaceId } = await getContext(app.container, req);
    return service.read(workspaceId, req.params.id);
  });

  app.post(
    '/pulls/:id/intent',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req): Promise<PrIntentDetail> => {
      const { workspaceId } = await getContext(app.container, req);
      return service.derive(workspaceId, req.params.id, { force: true });
    },
  );
}
