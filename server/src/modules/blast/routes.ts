import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrBlastRadius } from '@devdigest/shared';
import type { PrBlastRadius as PrBlastRadiusType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastService } from './service.js';

/**
 * L04 Blast Radius module.
 *   GET  /pulls/:id/blast          → the map, computed on read from the
 *                                    persistent code index. Zero model calls
 *                                    on every path (R8).
 *   POST /pulls/:id/blast/explain  → makes at most one model call, persists
 *                                    it, and returns the same body with
 *                                    `explanation` filled in.
 *
 * `response: { 200: PrBlastRadius }` on both — a body the schema rejects
 * becomes a 500 (serialization failure) instead of reaching the client,
 * exactly the trade-off `smart-diff/routes.ts` took first in this codebase.
 * Neither route touches Drizzle or an adapter directly — both delegate to
 * `BlastService`, which owns the tenancy gate.
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new BlastService(app.container);

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams, response: { 200: PrBlastRadius } } },
    async (req): Promise<PrBlastRadiusType> => {
      const { workspaceId } = await getContext(app.container, req);
      return service.read(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/blast/explain',
    {
      schema: { params: IdParams, response: { 200: PrBlastRadius } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req): Promise<PrBlastRadiusType> => {
      const { workspaceId } = await getContext(app.container, req);
      return service.explain(workspaceId, req.params.id);
    },
  );
}
