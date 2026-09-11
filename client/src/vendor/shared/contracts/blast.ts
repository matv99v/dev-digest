import { z } from 'zod';
import { BlastRadius } from './brief.js';

/** How much the map can be trusted. Driven by IndexState.status, never by
 *  IndexState.degraded — 'partial' is a working index and carries no flag. */
export const BlastIndexState = z.enum(['indexed', 'partial', 'degraded', 'none']);
export type BlastIndexState = z.infer<typeof BlastIndexState>;

/** One file that transitively imports a changed file, within REVERSE_DEPTH. */
export const BlastDependent = z.object({
  file: z.string(),
  depth: z.number().int(), // 1 or 2
  via: z.string(), // the depth-1 file it was reached through
  endpoints: z.array(z.string()), // "METHOD /path" — potentially affected
  crons: z.array(z.string()),
});
export type BlastDependent = z.infer<typeof BlastDependent>;

/** The reverse import walk rooted at one changed file. */
export const BlastReverseImpact = z.object({
  changed_file: z.string(),
  dependents: z.array(BlastDependent),
});
export type BlastReverseImpact = z.infer<typeof BlastReverseImpact>;

/** The cached one-paragraph model explanation. Null until Explain is pressed. */
export const BlastExplanation = z.object({
  text: z.string(),
  model: z.string().nullish(),
  provider: z.string().nullish(),
  derived_at: z.string(),
});
export type BlastExplanation = z.infer<typeof BlastExplanation>;

export const PrBlastRadius = BlastRadius.extend({
  status: BlastIndexState,
  /** Non-empty on every non-'indexed' status. Never masked by an empty array. */
  reason: z.string().nullish(),
  /** The sha the index rows were computed at — what every file:line links to. */
  indexed_sha: z.string().nullish(),
  /** True when any symbol hit MAX_CALLERS_PER_SYMBOL, so the UI can say so. */
  callers_truncated: z.boolean(),
  reverse: z.array(BlastReverseImpact),
  explanation: BlastExplanation.nullish(),
});
export type PrBlastRadius = z.infer<typeof PrBlastRadius>;
