import { z } from 'zod';
import { PrIntentRecord } from './review-api.js';

/**
 * PR Intent Layer contracts (L03). Extends `PrIntentRecord`
 * (`contracts/review-api.ts`) — not `Intent` (`contracts/brief.ts`) — because
 * `PrIntentRecord` already carries `pr_id`, and `PrIntentDetail` stays
 * structurally assignable to `Intent` so a future `PrBrief` composer can
 * consume it without a mapping step.
 *
 * `stale` is wire-only: derived from `derived_from_sha`/`derived_at` against
 * the current PR head at read time, and never persisted as a `pr_intent`
 * column.
 */

export const IntentConfidence = z.enum(['high', 'medium', 'low']);
export type IntentConfidence = z.infer<typeof IntentConfidence>;

export const IntentSourceKind = z.enum([
  'pr_body',
  'inline_plan',
  'linked_issue',
  'repo_doc',
  'title',
  'branch',
  'commits',
  'changed_paths',
]);
export type IntentSourceKind = z.infer<typeof IntentSourceKind>;

export const IntentSource = z.object({
  kind: IntentSourceKind,
  ref: z.string().nullish(),
});
export type IntentSource = z.infer<typeof IntentSource>;

export const PrIntentDetail = PrIntentRecord.extend({
  confidence: IntentConfidence,
  sources: z.array(IntentSource),
  derived_from_sha: z.string(),
  derived_at: z.string(),
  model: z.string().nullish(),
  provider: z.string().nullish(),
  stale: z.boolean(),
});
export type PrIntentDetail = z.infer<typeof PrIntentDetail>;
