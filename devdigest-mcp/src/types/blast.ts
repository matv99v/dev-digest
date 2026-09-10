/**
 * The blast-radius **wire** shape, declared locally (R8, R14).
 *
 * This mirrors `BlastRadius` at
 * `server/src/vendor/shared/contracts/brief.ts:16-44` field for field —
 * snake_case — and deliberately **not** the camelCase internal facade
 * `BlastResult` (`server/src/modules/repo-intel/types.ts:147`).
 *
 * Why the wire shape and not the facade: `get_blast_radius` is a stub today
 * (see `../tools/get-blast-radius.ts`). The later lesson that implements it for
 * real adds a route on `server/` and a mapper from the facade to this contract.
 * If the stub already answers in the contract's shape, that lesson writes a
 * mapper and a route; if it answered in the facade's shape, it would also have
 * to change a published contract, and the two vendored copies of
 * `@devdigest/shared` are already out of sync (`server/INSIGHTS.md:88-99`).
 *
 * Declared here rather than imported: this package has no `paths` alias into
 * `@devdigest/shared` and must never grow one — it is on zod 4 while
 * `reviewer-core` is on zod 3, and a barrel `export *` collision on a name as
 * common as `BlastRadius` is silent (`server/INSIGHTS.md:70-86`).
 *
 * Not `.strict()`, for the same reason the contract is not: the server may add
 * a field, and a stub whose schema rejects tomorrow's payload is a worse
 * failure than one that ignores an unknown key.
 */
import { z } from 'zod';

/** One call site of a changed symbol. */
export const BlastCallerWire = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
});
export type BlastCallerWire = z.infer<typeof BlastCallerWire>;

/** A symbol the diff touched. */
export const ChangedSymbolWire = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});
export type ChangedSymbolWire = z.infer<typeof ChangedSymbolWire>;

/** What one changed symbol reaches. */
export const DownstreamImpactWire = z.object({
  symbol: z.string(),
  callers: z.array(BlastCallerWire),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type DownstreamImpactWire = z.infer<typeof DownstreamImpactWire>;

/** The whole payload `get_blast_radius` returns — exactly three keys. */
export const BlastRadiusWire = z.object({
  changed_symbols: z.array(ChangedSymbolWire),
  downstream: z.array(DownstreamImpactWire),
  summary: z.string(),
});
export type BlastRadiusWire = z.infer<typeof BlastRadiusWire>;
