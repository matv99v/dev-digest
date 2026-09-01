import { and, asc, count, desc, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { INITIAL_SKILL_VERSION } from './constants.js';

/**
 * Skills data-access. Owns `skills` and `skill_versions`; reads (but does not
 * own) `agent_skills`, `agents`, `reviews` and `findings` for the stats query.
 * Workspace-scoped throughout.
 */

import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
export type { SkillRow, SkillVersionRow };

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description?: string;
  type: 'rubric' | 'convention' | 'security' | 'custom';
  source: 'manual' | 'imported_url' | 'extracted' | 'community';
  body: string;
  enabled?: boolean;
  evidenceFiles?: string[];
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: 'rubric' | 'convention' | 'security' | 'custom';
  source?: 'manual' | 'imported_url' | 'extracted' | 'community';
  body?: string;
  enabled?: boolean;
  evidenceFiles?: string[];
  /** Optional version note stored in skill_versions when body changes. */
  message?: string | null;
}

export interface SkillStatsRow {
  used_by_count: number;
  agents: { id: string; name: string }[];
  version_count: number;
  accept_rate: number | null;
  findings_last_30d: number;
  findings_by_category: Record<string, number>;
}

export class SkillsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<SkillRow[]> {
    return this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(t.skills.name));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  /** Insert a skill AND record version 1 in skill_versions. */
  async insert(values: InsertSkill): Promise<SkillRow> {
    const [row] = await this.db
      .insert(t.skills)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        description: values.description ?? '',
        type: values.type,
        source: values.source,
        body: values.body,
        enabled: values.enabled ?? true,
        version: INITIAL_SKILL_VERSION,
        evidenceFiles: values.evidenceFiles ?? null,
      })
      .returning();
    await this.db.insert(t.skillVersions).values({
      skillId: row!.id,
      version: INITIAL_SKILL_VERSION,
      body: row!.body,
      message: null,
    });
    return row!;
  }

  /** Update a skill. When body changes, bump version and record it in skill_versions. */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkill,
  ): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    const bodyChanged = patch.body !== undefined && patch.body !== existing.body;
    const nextVersion = bodyChanged ? existing.version + 1 : existing.version;

    const [row] = await this.db
      .update(t.skills)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.source !== undefined ? { source: patch.source } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.evidenceFiles !== undefined ? { evidenceFiles: patch.evidenceFiles } : {}),
        ...(bodyChanged ? { version: nextVersion } : {}),
      })
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning();

    if (bodyChanged && row) {
      await this.db.insert(t.skillVersions).values({
        skillId: row.id,
        version: nextVersion,
        body: row.body,
        message: patch.message ?? null,
      });
    }
    return row;
  }

  /** All body versions for a skill, newest first. */
  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  /** Restore a skill's body to a previous version (creates a new version entry). */
  async restore(
    workspaceId: string,
    skillId: string,
    version: number,
  ): Promise<SkillRow | undefined> {
    const [versionRow] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    if (!versionRow) return undefined;

    return this.update(workspaceId, skillId, {
      body: versionRow.body,
      message: `Restored from version ${version}`,
    });
  }

  /** Usage and finding stats for a skill. */
  async stats(skillId: string): Promise<SkillStatsRow> {
    const agentRows = await this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(eq(t.agentSkills.skillId, skillId));

    const [versionCountRow] = await this.db
      .select({ cnt: count() })
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId));
    const versionCount = Number(versionCountRow?.cnt ?? 0);

    // Findings attributed to this skill via the agent(s) it's linked to, in
    // the last 30 days — coarse attribution (a finding is credited to every
    // skill linked to the agent that produced it), documented on the contract.
    const findingRows = await this.db
      .select({
        category: t.findings.category,
        acceptedAt: t.findings.acceptedAt,
        dismissedAt: t.findings.dismissedAt,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .innerJoin(
        t.agentSkills,
        and(eq(t.agentSkills.agentId, sql`${t.reviews.agentId}`), eq(t.agentSkills.skillId, skillId)),
      )
      .where(gte(t.reviews.createdAt, sql`now() - interval '30 days'`));

    const findingsByCategory: Record<string, number> = {};
    let decided = 0;
    let accepted = 0;
    for (const row of findingRows) {
      findingsByCategory[row.category] = (findingsByCategory[row.category] ?? 0) + 1;
      if (row.acceptedAt) {
        decided += 1;
        accepted += 1;
      } else if (row.dismissedAt) {
        decided += 1;
      }
    }

    return {
      used_by_count: agentRows.length,
      agents: agentRows,
      version_count: versionCount,
      accept_rate: decided > 0 ? accepted / decided : null,
      findings_last_30d: findingRows.length,
      findings_by_category: findingsByCategory,
    };
  }
}
