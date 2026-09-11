import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { BlastSummaryRow } from './helpers.js';

export type { BlastSummaryRow };

export interface UpsertBlastSummaryInput {
  explanation: string;
  derivedFromSha: string;
  derivedFromIndexSha: string;
  provider: string | null;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
}

/**
 * The ONLY SQL over `pr_blast_summary`. Constructor takes plain `Db`, never
 * `Db | Tx` — this writes one row with one upsert, so there is no atomic
 * multi-row replace to protect (`server/INSIGHTS.md` 2026-09-01: a repository
 * only needs `Db | Tx` once a service actually opens a transaction around it;
 * cargo-culting the wider type here would have no caller that ever uses it).
 */
export class BlastRepository {
  constructor(private db: Db) {}

  async getSummary(prId: string): Promise<BlastSummaryRow | undefined> {
    const [row] = await this.db.select().from(t.prBlastSummary).where(eq(t.prBlastSummary.prId, prId));
    return row;
  }

  /**
   * Insert-or-replace the full row for one PR. `set` mirrors `values` column
   * for column — a column present in `values` but missing from `set` would
   * keep a stale field (e.g. the old `derivedFromIndexSha`) after a
   * re-Explain, which then reads as fresh forever (`isSummaryFresh`).
   */
  async upsertSummary(prId: string, values: UpsertBlastSummaryInput): Promise<void> {
    const row = {
      prId,
      explanation: values.explanation,
      derivedFromSha: values.derivedFromSha,
      derivedFromIndexSha: values.derivedFromIndexSha,
      derivedAt: new Date(),
      provider: values.provider,
      model: values.model,
      tokensIn: values.tokensIn,
      tokensOut: values.tokensOut,
      costUsd: values.costUsd,
    };
    await this.db
      .insert(t.prBlastSummary)
      .values(row)
      .onConflictDoUpdate({
        target: t.prBlastSummary.prId,
        set: {
          explanation: row.explanation,
          derivedFromSha: row.derivedFromSha,
          derivedFromIndexSha: row.derivedFromIndexSha,
          derivedAt: row.derivedAt,
          provider: row.provider,
          model: row.model,
          tokensIn: row.tokensIn,
          tokensOut: row.tokensOut,
          costUsd: row.costUsd,
        },
      });
  }
}
