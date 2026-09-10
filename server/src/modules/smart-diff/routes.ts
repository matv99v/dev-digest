import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { SmartDiffResponse } from '@devdigest/shared';
import type { SmartDiffResponse as SmartDiffResponseType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { SmartDiffService } from './service.js';

/**
 * Smart Diff (L03).
 *   GET /pulls/:id/smart-diff → the reviewer-ordered diff, computed on read
 *   from the `pr_files` + `findings` rows the PR detail already persisted.
 *   Never calls GitHub, never calls a model (R4), writes nothing.
 *
 * First route in this codebase to declare a `response` schema
 * (`app.setSerializerCompiler` is already installed globally, `src/app.ts`).
 * That's deliberate: a body `buildSmartDiff` emits that doesn't match
 * `SmartDiff` fails at serialization (500) instead of reaching the client —
 * see docs/plans/04-smart-diff.md's "First route ... to declare a response
 * schema" for the trade-off.
 */
export default async function smartDiffRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SmartDiffService(app.container);

  app.get(
    '/pulls/:id/smart-diff',
    { schema: { params: IdParams, response: { 200: SmartDiffResponse } } },
    async (req): Promise<SmartDiffResponseType> => {
      const { workspaceId } = await getContext(app.container, req);
      return service.build(workspaceId, req.params.id);
    },
  );
}
