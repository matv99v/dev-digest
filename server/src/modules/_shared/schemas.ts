import { z } from 'zod';

/**
 * Shared route param schemas. Most `/:id` routes address a DB row whose primary
 * key is a uuid (see db/schema/*), so validate that shape at the edge — an
 * invalid id becomes a clean 422 instead of a downstream DB/500.
 *
 * NOTE: not every `:id` is a uuid (e.g. `/providers/:id` where id is a provider
 * name like "openai"); those routes use `NameParams` below.
 */
export const IdParams = z.object({ id: z.string().uuid() });
export type IdParams = z.infer<typeof IdParams>;

/**
 * For the `/:id` routes whose id is a name rather than a uuid — provider ids,
 * settings sections, and anything else addressed by a stable slug.
 *
 * Deliberately narrow: lowercase, digits, `-` and `_`, 1-64 chars. That covers
 * every such id in the tree today, and keeps a path segment from smuggling a
 * dot-segment or an encoded slash into a downstream lookup.
 */
export const NAME_PARAM_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export const NameParams = z.object({ id: z.string().regex(NAME_PARAM_RE) });
export type NameParams = z.infer<typeof NameParams>;
