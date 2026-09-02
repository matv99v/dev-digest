import { z } from 'zod';
import { SkillType } from './knowledge.js';

/**
 * Conventions Extractor contracts (L02, the other half). `ConventionCandidate`
 * already lives in `contracts/knowledge.ts` as unfed starter scaffold — this
 * file does NOT reuse it (same shape, different name would still collide via
 * the barrel's `export *`); these are the real DTOs the conventions module
 * returns once it exists. See `server/INSIGHTS.md` (2026-09-01) on why a new
 * contract needs a distinct name from anything already in the barrel.
 */

export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ConventionStatus = z.infer<typeof ConventionStatus>;

export const ConventionEvidence = z.object({
  path: z.string(),
  line_start: z.number().int(),
  line_end: z.number().int(),
  snippet: z.string(),
});
export type ConventionEvidence = z.infer<typeof ConventionEvidence>;

export const Convention = z.object({
  id: z.string(),
  repo_id: z.string(),
  category: z.string().nullable(),
  rule: z.string(),
  evidence: ConventionEvidence,
  confidence: z.number().min(0).max(1),
  status: ConventionStatus,
  skill_id: z.string().nullable(),
  scanned_sha: z.string().nullable(),
  created_at: z.string(),
});
export type Convention = z.infer<typeof Convention>;

export const ConventionScan = z.object({
  candidates: z.array(Convention),
  sampled_files: z.number().int(),
  dropped_unverified: z.number().int(),
  scanned_sha: z.string().nullable(),
  scanned_at: z.string().nullable(),
});
export type ConventionScan = z.infer<typeof ConventionScan>;

export const ConventionSkillDraft = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  enabled: z.boolean(),
  body: z.string(),
  convention_ids: z.array(z.string()),
  evidence_files: z.array(z.string()),
});
export type ConventionSkillDraft = z.infer<typeof ConventionSkillDraft>;

/** Body of `PATCH /conventions/:id` — accept / reject / edit one candidate. */
export const ConventionPatch = z.object({
  status: ConventionStatus.optional(),
  rule: z.string().min(1).optional(),
  category: z.string().nullable().optional(),
});
export type ConventionPatch = z.infer<typeof ConventionPatch>;

export const ConventionSkillDraftMode = z.enum(['merged', 'per_category']);
export type ConventionSkillDraftMode = z.infer<typeof ConventionSkillDraftMode>;
