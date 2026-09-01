import { z } from 'zod';

/**
 * Skills module contracts (L02). `Skill` / `SkillType` / `SkillSource` /
 * `AgentSkillLink` already live in `contracts/knowledge.ts` — this file adds
 * only what the skills CRUD module needs on top of them: version history,
 * usage/finding stats, and the import-preview shape.
 */

export const SkillVersion = z.object({
  skill_id: z.string(),
  version: z.number().int(),
  body: z.string(),
  /** Human note on what changed in this version, e.g. "Added Tests dimension". */
  message: z.string().nullable(),
  created_at: z.string(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

export const SkillStats = z.object({
  used_by_count: z.number().int(),
  agents: z.array(z.object({ id: z.string(), name: z.string() })),
  version_count: z.number().int(),
  /**
   * Fraction of this skill's attributed findings that were accepted, in
   * [0, 1]. Attribution is via the agent (finding → review → agent →
   * agent_skills), so a finding is credited to every skill linked to the
   * agent that produced it — this is a known coarseness, not a bug, and the
   * UI must label it as such. Null when there is no accept/dismiss signal
   * yet (never render as 0%).
   */
  accept_rate: z.number().min(0).max(1).nullable(),
  findings_last_30d: z.number().int(),
  findings_by_category: z.record(z.string(), z.number().int()),
});
export type SkillStats = z.infer<typeof SkillStats>;

/** Result of parsing an uploaded skill file/archive — persists nothing. */
export const SkillImportPreview = z.object({
  name: z.string(),
  description: z.string(),
  type: z.enum(['rubric', 'convention', 'security', 'custom']),
  source: z.enum(['manual', 'imported_url', 'extracted', 'community']),
  body: z.string(),
  /** Archive entries other than the resolved markdown file — never read or
      executed, listed so the UI can say plainly what was ignored. */
  ignored_files: z.array(z.string()),
});
export type SkillImportPreview = z.infer<typeof SkillImportPreview>;
