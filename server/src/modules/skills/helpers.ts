import type { Skill, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';

/**
 * Pure helpers for the skills module — DB row ⇄ DTO mapping and the
 * version-bump rule. No I/O.
 */

/** Map a persisted skill row to the public `Skill` DTO. */
export function toSkillDto(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
  };
}

/** Map a persisted `skill_versions` row to the public `SkillVersion` DTO. */
export function toSkillVersionDto(row: SkillVersionRow): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    message: row.message ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

/** A body change is the only thing that bumps a skill's version — name/
 *  description/type/enabled are metadata, not the reviewed instructions. */
export function isBodyChange(existing: Pick<SkillRow, 'body'>, patchBody?: string): boolean {
  return patchBody !== undefined && patchBody !== existing.body;
}
