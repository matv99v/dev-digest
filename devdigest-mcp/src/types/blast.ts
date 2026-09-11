/**
 * The blast-radius **wire** shape, declared locally (R12, R14).
 *
 * This mirrors `PrBlastRadius` at
 * `server/src/vendor/shared/contracts/blast.ts` field for field — snake_case —
 * and deliberately **not** the camelCase internal facade `BlastResult`
 * (`server/src/modules/repo-intel/types.ts:147`). `PrBlastRadius` itself is
 * `BlastRadius.extend({...})` from `contracts/brief.ts:16-44`, so this file
 * mirrors both: the base four fields plus the six the extension adds.
 *
 * Declared here rather than imported: this package has no `paths` alias into
 * `@devdigest/shared` and must never grow one — it is on zod 4 while
 * `reviewer-core` is on zod 3, and a barrel `export *` collision on a name as
 * common as `BlastRadius` is silent (`server/INSIGHTS.md:70-86`).
 *
 * Not `.strict()`: the server may add a field, and a tool whose schema rejects
 * tomorrow's payload is a worse failure than one that ignores an unknown key.
 * **That cuts the other way too** — because zod strips unknown keys silently,
 * every field this tool's caller needs to read must be spelled out here, or it
 * vanishes from `structuredContent` with no error anywhere. `status`, `reason`
 * and `indexed_sha` are the ones R12 asserts survive `parse`: without them a
 * degraded or unindexed map would parse clean and still read as a bare,
 * trustworthy map — the exact "empty data masquerading as an answer" failure
 * this tool exists to avoid.
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

/** What one changed symbol reaches, on the (forward) callers side. */
export const DownstreamImpactWire = z.object({
  symbol: z.string(),
  callers: z.array(BlastCallerWire),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});
export type DownstreamImpactWire = z.infer<typeof DownstreamImpactWire>;

/** How much the map can be trusted. Driven by the server's `IndexState.status`,
 *  never by a degraded flag — `partial` is a working index and carries none. */
export const BlastIndexStateWire = z.enum(['indexed', 'partial', 'degraded', 'none']);
export type BlastIndexStateWire = z.infer<typeof BlastIndexStateWire>;

/** One file that transitively imports a changed file, within the server's
 *  `REVERSE_DEPTH`. */
export const BlastDependentWire = z.object({
  file: z.string(),
  depth: z.number().int(), // 1 or 2
  via: z.string(), // the depth-1 file it was reached through
  endpoints: z.array(z.string()), // "METHOD /path" — potentially affected
  crons: z.array(z.string()),
});
export type BlastDependentWire = z.infer<typeof BlastDependentWire>;

/** The reverse import walk rooted at one changed file. */
export const BlastReverseImpactWire = z.object({
  changed_file: z.string(),
  dependents: z.array(BlastDependentWire),
});
export type BlastReverseImpactWire = z.infer<typeof BlastReverseImpactWire>;

/** The cached one-paragraph model explanation. Null until Explain is pressed
 *  on a GET, or absent on a POST that was refused (status `none`). */
export const BlastExplanationWire = z.object({
  text: z.string(),
  model: z.string().nullish(),
  provider: z.string().nullish(),
  derived_at: z.string(),
});
export type BlastExplanationWire = z.infer<typeof BlastExplanationWire>;

/** The whole payload `get_blast_radius` returns — the base map plus the
 *  honesty and reverse-impact fields `PrBlastRadius` extends it with. */
export const BlastRadiusWire = z.object({
  changed_symbols: z.array(ChangedSymbolWire),
  downstream: z.array(DownstreamImpactWire),
  summary: z.string(),
  status: BlastIndexStateWire,
  /** Non-empty on every non-`indexed` status. Never masked by an empty array. */
  reason: z.string().nullish(),
  /** The sha the index rows were computed at — what every caller `file:line`
   *  in this payload is pinned to, not the PR head sha. */
  indexed_sha: z.string().nullish(),
  /** True when any symbol hit the server's per-symbol caller cap. */
  callers_truncated: z.boolean(),
  reverse: z.array(BlastReverseImpactWire),
  explanation: BlastExplanationWire.nullish(),
});
export type BlastRadiusWire = z.infer<typeof BlastRadiusWire>;
