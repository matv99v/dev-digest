import { and, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { Intent, IntentConfidence, IntentSource } from '@devdigest/shared';
import type { PullRow } from '../../../db/rows.js';

// ---- PR lookup (workspace-scoped) -----------------------------------------

export async function getPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<PullRow | undefined> {
  const [row] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  return row;
}

export async function getRepo(
  db: Db,
  repoId: string,
): Promise<typeof t.repos.$inferSelect | undefined> {
  const [row] = await db.select().from(t.repos).where(eq(t.repos.id, repoId));
  return row;
}

export async function getPrFiles(
  db: Db,
  prId: string,
): Promise<(typeof t.prFiles.$inferSelect)[]> {
  return db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
}

/** Commit messages for a PR — one of the L03 intent layer's baseline
 *  "indirect" evidence signals (title/branch/commits/changed_paths), used
 *  when there's no real documentation to derive from. */
export async function getPrCommits(
  db: Db,
  prId: string,
): Promise<(typeof t.prCommits.$inferSelect)[]> {
  return db.select().from(t.prCommits).where(eq(t.prCommits.prId, prId));
}

/**
 * Record the commit a review just ran against, so the PR list can derive
 * `reviewed` vs `needs_review` (head moved since the last review) vs `stale`.
 */
export async function markReviewed(db: Db, prId: string, sha: string): Promise<void> {
  await db
    .update(t.pullRequests)
    .set({ lastReviewedSha: sha })
    .where(eq(t.pullRequests.id, prId));
}

// ---- intent -----------------------------------------------------------
//
// TENANCY NOTE (L03): `pr_intent` carries no `workspace_id` column — it is a
// SATELLITE table keyed 1:1 on `pull_requests.id` by a primary key that is
// ALSO a cascading FK (`prId` below), exactly like `findings`, `pr_files`,
// `pr_commits` and `pr_brief`. It is unreachable except through a parent row
// that already carries `workspace_id`, so the boundary is enforced ONE LAYER
// UP: every caller into `upsertIntent` / `getIntent` / `getIntentRow` MUST
// have already resolved `workspaceId` and loaded the parent PR through the
// already-scoped `getPull(workspaceId, prId)` above, which throws
// `NotFoundError` before any `pr_intent` statement below ever runs
// (`modules/intent/service.ts`). None of the three functions here take or
// check a `workspaceId` themselves — that is what makes this the ONE place
// the guarantee must be reviewed, not re-derived per caller.

export type IntentRow = typeof t.prIntent.$inferSelect;

export interface UpsertIntentInput {
  intent: string;
  inScope: string[];
  outOfScope: string[];
  confidence: IntentConfidence;
  sources: IntentSource[];
  derivedFromSha: string;
  provider: string | null;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
}

/**
 * Insert-or-replace the full `pr_intent` row for one PR. `set` mirrors
 * `values` COLUMN FOR COLUMN — a column present in `values` but missing from
 * `set` would make a re-derive on a moved head keep the OLD `derivedFromSha`
 * (or any other stale field), which then reads as fresh forever
 * (`isIntentFresh`, `helpers.ts`).
 */
export async function upsertIntent(db: Db, prId: string, values: UpsertIntentInput): Promise<void> {
  const row = {
    prId,
    intent: values.intent,
    inScope: values.inScope,
    outOfScope: values.outOfScope,
    confidence: values.confidence,
    sources: values.sources,
    derivedFromSha: values.derivedFromSha,
    derivedAt: new Date(),
    provider: values.provider,
    model: values.model,
    tokensIn: values.tokensIn,
    tokensOut: values.tokensOut,
    costUsd: values.costUsd,
  };
  await db
    .insert(t.prIntent)
    .values(row)
    .onConflictDoUpdate({
      target: t.prIntent.prId,
      set: {
        intent: row.intent,
        inScope: row.inScope,
        outOfScope: row.outOfScope,
        confidence: row.confidence,
        sources: row.sources,
        derivedFromSha: row.derivedFromSha,
        derivedAt: row.derivedAt,
        provider: row.provider,
        model: row.model,
        tokensIn: row.tokensIn,
        tokensOut: row.tokensOut,
        costUsd: row.costUsd,
      },
    });
}

/** Narrow read — the `Intent` shape only (pre-L03 shape, kept for whatever
 *  still wants just the narrative + scope, e.g. a future `PrBrief` composer). */
export async function getIntent(db: Db, prId: string): Promise<Intent | undefined> {
  const [row] = await db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
  if (!row) return undefined;
  return { intent: row.intent, in_scope: row.inScope, out_of_scope: row.outOfScope };
}

/** Full read — every L03 column, for `toIntentDetail` (`modules/intent/helpers.ts`)
 *  to shape into the wire `PrIntentDetail`. */
export async function getIntentRow(db: Db, prId: string): Promise<IntentRow | undefined> {
  const [row] = await db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
  return row;
}
