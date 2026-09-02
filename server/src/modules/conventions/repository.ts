import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Conventions data-access. Owns the `conventions` table; reads (but does not
 * own) `repos` for `getRepoBasics`, the same shape repo-intel's repository
 * already reads for the same reason (this module needs a `RepoRef` to call
 * the `GitClient` port). Workspace-scoped throughout except `getScanMeta`,
 * which reads its own already-scoped rows.
 */

import type { ConventionRow } from '../../db/rows.js';
export type { ConventionRow };

/**
 * A repository method may run inside the service's transaction. `Db['transaction']`
 * hands its callback a `PgTransaction`, which is not structurally identical to
 * `Db` (it lacks `$client` etc.) — derive the exact type from `Db` itself so a
 * repository constructed with either a plain `Db` or a transaction handle
 * type-checks, per the onion-architecture rule that the SERVICE opens
 * transactions and passes the handle down.
 */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface RepoBasics {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  clonePath: string | null;
}

export interface InsertConvention {
  rule: string;
  category: string | null;
  evidencePath: string | null;
  evidenceSnippet: string | null;
  evidenceLineStart: number | null;
  evidenceLineEnd: number | null;
  confidence: number | null;
  scannedSha: string | null;
}

export interface UpdateConvention {
  status?: 'pending' | 'accepted' | 'rejected';
  rule?: string;
  category?: string | null;
}

export interface ScanMeta {
  scannedSha: string | null;
  scannedAt: string | null;
}

export class ConventionsRepository {
  constructor(private db: Db | Tx) {}

  /** Minimal repo shape needed to build a `RepoRef` for the `GitClient` port. */
  async getRepoBasics(workspaceId: string, repoId: string): Promise<RepoBasics | undefined> {
    const [row] = await this.db
      .select({
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
        defaultBranch: t.repos.defaultBranch,
        clonePath: t.repos.clonePath,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /** All conventions for a repo, newest first. */
  async list(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.createdAt));
  }

  /** Only the accepted rows — the source `buildSkillDrafts` composes from. */
  async listAccepted(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.status, 'accepted'),
        ),
      );
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  async getByIds(workspaceId: string, ids: string[]): Promise<ConventionRow[]> {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), inArray(t.conventions.id, ids)));
  }

  /**
   * Replace all conventions for a repo with a fresh scan's verified
   * candidates (delete-then-insert). The caller (the service) is responsible
   * for wrapping this in a transaction — this method just executes on
   * whatever `Db`/`Tx` it was constructed with.
   */
  async replaceForRepo(
    workspaceId: string,
    repoId: string,
    scannedSha: string | null,
    rows: InsertConvention[],
  ): Promise<ConventionRow[]> {
    await this.db
      .delete(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)));

    if (rows.length === 0) return [];

    return this.db
      .insert(t.conventions)
      .values(
        rows.map((r) => ({
          workspaceId,
          repoId,
          rule: r.rule,
          category: r.category,
          evidencePath: r.evidencePath,
          evidenceSnippet: r.evidenceSnippet,
          evidenceLineStart: r.evidenceLineStart,
          evidenceLineEnd: r.evidenceLineEnd,
          confidence: r.confidence,
          scannedSha: scannedSha ?? r.scannedSha,
          status: 'pending' as const,
        })),
      )
      .returning();
  }

  /** Accept / reject / edit one candidate. */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateConvention,
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
      })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }

  /** Stamp `skillId` onto the source rows once a skill is created from them. */
  async stampSkillId(workspaceId: string, ids: string[], skillId: string): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(t.conventions)
      .set({ skillId })
      .where(and(eq(t.conventions.workspaceId, workspaceId), inArray(t.conventions.id, ids)));
  }

  /**
   * Latest scan metadata, derived from the currently-persisted rows (there is
   * no separate "scans" table — a scan IS the set of rows `replaceForRepo`
   * just wrote, all sharing one `scannedSha`/insert timestamp).
   */
  async getScanMeta(workspaceId: string, repoId: string): Promise<ScanMeta> {
    const rows = await this.list(workspaceId, repoId);
    const latest = rows[0];
    if (!latest) return { scannedSha: null, scannedAt: null };
    return { scannedSha: latest.scannedSha, scannedAt: latest.createdAt.toISOString() };
  }
}
