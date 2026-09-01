import { and, asc, count, desc, eq, gte, lt, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { CiFailOn, Provider, ReviewStrategy } from '@devdigest/shared';
import { DEFAULT_AGENT_DESCRIPTION, INITIAL_AGENT_VERSION, RUN_HISTORY_LIMIT } from './constants.js';
import { isConfigChange } from './helpers.js';

/**
 * A2 — agents data-access. Owns `agents`, `agent_versions`, and the
 * `agent_skills` link table (shared with A1's skills repository, but A2 owns the
 * agent side: link/reorder/list for an agent). Workspace-scoped throughout.
 */

import type { AgentRow, AgentVersionRow } from '../../db/rows.js';
export type { AgentRow, AgentVersionRow };

export interface InsertAgent {
  workspaceId: string;
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
  enabled?: boolean;
  createdBy?: string | null;
}

export interface UpdateAgent {
  name?: string;
  description?: string;
  provider?: Provider;
  model?: string;
  systemPrompt?: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
  enabled?: boolean;
}

/** A skill linked to an agent (with its order), joined from agent_skills. */
export interface LinkedSkillRow {
  skill: typeof t.skills.$inferSelect;
  order: number;
}

export class AgentsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<AgentRow[]> {
    return this.db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId));
  }

  async listEnabled(workspaceId: string): Promise<AgentRow[]> {
    return this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.enabled, true)));
  }

  async getById(workspaceId: string, id: string): Promise<AgentRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)));
    return row;
  }

  /** Delete an agent (scoped to workspace). Versions/skill-links cascade;
   *  agent_runs keep their history with agent_id set null. Returns false if
   *  no such agent existed in the workspace. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .returning({ id: t.agents.id });
    return rows.length > 0;
  }

  /** Insert an agent AND record version 1 in agent_versions (immutable snapshot). */
  async insert(values: InsertAgent): Promise<AgentRow> {
    const [row] = await this.db
      .insert(t.agents)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        description: values.description ?? DEFAULT_AGENT_DESCRIPTION,
        provider: values.provider,
        model: values.model,
        systemPrompt: values.systemPrompt,
        outputSchema: (values.outputSchema as object | undefined) ?? null,
        ...(values.strategy !== undefined ? { strategy: values.strategy } : {}),
        ...(values.ciFailOn !== undefined ? { ciFailOn: values.ciFailOn } : {}),
        ...(values.repoIntel !== undefined ? { repoIntel: values.repoIntel } : {}),
        enabled: values.enabled ?? true,
        version: INITIAL_AGENT_VERSION,
        createdBy: values.createdBy ?? null,
      })
      .returning();
    await this.snapshotVersion(row!, INITIAL_AGENT_VERSION);
    return row!;
  }

  /**
   * Update an agent. Any config change bumps the version and snapshots the new
   * config into agent_versions (reproducibility for eval).
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateAgent,
  ): Promise<AgentRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    // A config-affecting change (anything except just toggling enabled) bumps version.
    const configChanged = isConfigChange(existing, patch);
    const nextVersion = configChanged ? existing.version + 1 : existing.version;

    const [row] = await this.db
      .update(t.agents)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
        ...(patch.model !== undefined ? { model: patch.model } : {}),
        ...(patch.systemPrompt !== undefined ? { systemPrompt: patch.systemPrompt } : {}),
        ...(patch.outputSchema !== undefined
          ? { outputSchema: patch.outputSchema as object }
          : {}),
        ...(patch.strategy !== undefined ? { strategy: patch.strategy } : {}),
        ...(patch.ciFailOn !== undefined ? { ciFailOn: patch.ciFailOn } : {}),
        ...(patch.repoIntel !== undefined ? { repoIntel: patch.repoIntel } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(configChanged ? { version: nextVersion } : {}),
      })
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .returning();

    if (configChanged && row) await this.snapshotVersion(row, nextVersion);
    return row;
  }

  private async snapshotVersion(row: AgentRow, version: number): Promise<void> {
    const skills = await this.skillIdsForAgent(row.id);
    await this.db
      .insert(t.agentVersions)
      .values({
        agentId: row.id,
        version,
        configJson: {
          provider: row.provider,
          model: row.model,
          system_prompt: row.systemPrompt,
          output_schema: row.outputSchema,
          strategy: row.strategy,
          ci_fail_on: row.ciFailOn,
          repo_intel: row.repoIntel,
          skills,
        },
      })
      .onConflictDoNothing();
  }

  // ---- agent_versions (immutable config snapshots) ------------------------

  /** All config snapshots for an agent, newest version first. */
  async listVersions(agentId: string): Promise<AgentVersionRow[]> {
    return this.db
      .select()
      .from(t.agentVersions)
      .where(eq(t.agentVersions.agentId, agentId))
      .orderBy(desc(t.agentVersions.version));
  }

  /** A single config snapshot, or undefined if that version was never recorded. */
  async getVersion(agentId: string, version: number): Promise<AgentVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agentVersions)
      .where(and(eq(t.agentVersions.agentId, agentId), eq(t.agentVersions.version, version)));
    return row;
  }

  // ---- agent_skills link table (A2 owns the agent side) -------------------

  /** Skills linked to an agent, in `order` ascending. */
  async linkedSkills(agentId: string): Promise<LinkedSkillRow[]> {
    const rows = await this.db
      .select({ skill: t.skills, order: t.agentSkills.order })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.agentSkills.agentId, agentId))
      .orderBy(asc(t.agentSkills.order));
    return rows.map((r) => ({ skill: r.skill, order: r.order }));
  }

  async skillIdsForAgent(agentId: string): Promise<string[]> {
    const links = await this.linkedSkills(agentId);
    return links.map((l) => l.skill.id);
  }

  /** Link a skill to an agent at a given order (idempotent: upserts order). */
  async linkSkill(agentId: string, skillId: string, order: number): Promise<void> {
    await this.db
      .insert(t.agentSkills)
      .values({ agentId, skillId, order })
      .onConflictDoUpdate({
        target: [t.agentSkills.agentId, t.agentSkills.skillId],
        set: { order },
      });
  }

  async unlinkSkill(agentId: string, skillId: string): Promise<void> {
    await this.db
      .delete(t.agentSkills)
      .where(and(eq(t.agentSkills.agentId, agentId), eq(t.agentSkills.skillId, skillId)));
  }

  /**
   * Replace the full set of linked skills for an agent with `skillIds`, assigning
   * order = index. Used by the "Skills" editor tab (attach/reorder). Skills not in
   * the list are unlinked.
   */
  async setSkills(agentId: string, skillIds: string[]): Promise<void> {
    await this.db.delete(t.agentSkills).where(eq(t.agentSkills.agentId, agentId));
    if (skillIds.length === 0) return;
    await this.db
      .insert(t.agentSkills)
      .values(skillIds.map((skillId, i) => ({ agentId, skillId, order: i })));
  }

  // ---- Stats — agent_runs + reviews/findings, workspace-scoped -------------

  /**
   * Per-agent run/accept summary for every agent in the workspace, over the
   * last 30 days — the batch used by the Agents grid's card footers. Only
   * agents with at least one row in either query appear; the service fills
   * every other agent in the workspace with zeros/nulls.
   */
  async statsSummaries(workspaceId: string): Promise<
    { agentId: string; runs30d: number; avgCostUsd: number | null; accepted: number; decided: number }[]
  > {
    const runRows = await this.db
      .select({
        agentId: t.agentRuns.agentId,
        runs30d: count(),
        avgCost: sql<string | null>`avg(${t.agentRuns.costUsd})`,
      })
      .from(t.agentRuns)
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          gte(t.agentRuns.ranAt, sql`now() - interval '30 days'`),
        ),
      )
      .groupBy(t.agentRuns.agentId);

    const findingRows = await this.db
      .select({
        agentId: t.reviews.agentId,
        accepted: sql<string>`count(*) filter (where ${t.findings.acceptedAt} is not null)`,
        decided: sql<string>`count(*) filter (where ${t.findings.acceptedAt} is not null or ${t.findings.dismissedAt} is not null)`,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .where(
        and(
          eq(t.reviews.workspaceId, workspaceId),
          gte(t.reviews.createdAt, sql`now() - interval '30 days'`),
        ),
      )
      .groupBy(t.reviews.agentId);

    const acceptByAgent = new Map<string, { accepted: number; decided: number }>();
    for (const r of findingRows) {
      if (!r.agentId) continue;
      acceptByAgent.set(r.agentId, { accepted: Number(r.accepted), decided: Number(r.decided) });
    }

    return runRows
      .filter((r): r is typeof r & { agentId: string } => r.agentId != null)
      .map((r) => {
        const acc = acceptByAgent.get(r.agentId);
        return {
          agentId: r.agentId,
          runs30d: Number(r.runs30d),
          avgCostUsd: r.avgCost == null ? null : Number(r.avgCost),
          accepted: acc?.accepted ?? 0,
          decided: acc?.decided ?? 0,
        };
      });
  }

  /** agent_runs rows for one agent, `ranAt` in the last 30 days. */
  private async runRowsCurrentWindow(
    agentId: string,
  ): Promise<{ ranAt: Date | null; durationMs: number | null; costUsd: number | null }[]> {
    return this.db
      .select({
        ranAt: t.agentRuns.ranAt,
        durationMs: t.agentRuns.durationMs,
        costUsd: t.agentRuns.costUsd,
      })
      .from(t.agentRuns)
      .where(
        and(
          eq(t.agentRuns.agentId, agentId),
          gte(t.agentRuns.ranAt, sql`now() - interval '30 days'`),
        ),
      );
  }

  /** agent_runs rows for one agent, `ranAt` 30–60 days ago — the baseline
   *  `avg_cost_delta` compares the current window against. */
  private async runRowsPriorWindow(agentId: string): Promise<{ costUsd: number | null }[]> {
    return this.db
      .select({ costUsd: t.agentRuns.costUsd })
      .from(t.agentRuns)
      .where(
        and(
          eq(t.agentRuns.agentId, agentId),
          gte(t.agentRuns.ranAt, sql`now() - interval '60 days'`),
          lt(t.agentRuns.ranAt, sql`now() - interval '30 days'`),
        ),
      );
  }

  /** Everything the Stats tab needs for one agent, as raw rows — bucketing and
   *  aggregation are pure functions in `./helpers.ts` over these. */
  async statsDetail(agentId: string): Promise<{
    runsCurrentWindow: { ranAt: Date | null; durationMs: number | null; costUsd: number | null }[];
    runsPriorWindow: { costUsd: number | null }[];
    findings: { category: string; severity: string; acceptedAt: Date | null; dismissedAt: Date | null; reviewCreatedAt: Date | null }[];
    runHistory: {
      runId: string;
      ranAt: Date | null;
      repoId: string | null;
      prNumber: number | null;
      tokensIn: number | null;
      tokensOut: number | null;
      costUsd: number | null;
      durationMs: number | null;
      findingsCount: number | null;
      source: string | null;
      status: string | null;
    }[];
  }> {
    const [runsCurrentWindow, runsPriorWindow, findingRows, runHistory] = await Promise.all([
      this.runRowsCurrentWindow(agentId),
      this.runRowsPriorWindow(agentId),
      this.db
        .select({
          category: t.findings.category,
          severity: t.findings.severity,
          acceptedAt: t.findings.acceptedAt,
          dismissedAt: t.findings.dismissedAt,
          reviewCreatedAt: t.reviews.createdAt,
        })
        .from(t.findings)
        .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
        .where(
          and(
            eq(t.reviews.agentId, agentId),
            gte(t.reviews.createdAt, sql`now() - interval '30 days'`),
          ),
        ),
      this.db
        .select({
          runId: t.agentRuns.id,
          ranAt: t.agentRuns.ranAt,
          repoId: t.pullRequests.repoId,
          prNumber: t.pullRequests.number,
          tokensIn: t.agentRuns.tokensIn,
          tokensOut: t.agentRuns.tokensOut,
          costUsd: t.agentRuns.costUsd,
          durationMs: t.agentRuns.durationMs,
          findingsCount: t.agentRuns.findingsCount,
          source: t.agentRuns.source,
          status: t.agentRuns.status,
        })
        .from(t.agentRuns)
        .leftJoin(t.pullRequests, eq(t.pullRequests.id, t.agentRuns.prId))
        .where(eq(t.agentRuns.agentId, agentId))
        .orderBy(desc(t.agentRuns.ranAt))
        .limit(RUN_HISTORY_LIMIT),
    ]);

    return {
      runsCurrentWindow,
      runsPriorWindow,
      findings: findingRows,
      runHistory,
    };
  }
}
