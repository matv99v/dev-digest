import type { PrBlastRadius } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { withRetry, withTimeout } from '../../platform/resilience.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import type { PullRow } from '../../db/rows.js';
import { BlastRepository } from './repository.js';
import {
  buildExplainPrompt,
  groupDownstream,
  buildReverseImpact,
  isSummaryFresh,
  mapStatus,
  toPrBlastRadius,
  type BlastResultLike,
  type ReverseDependentRowLike,
  type MappedStatus,
} from './helpers.js';
import { EXPLAIN_FEATURE_MODEL_ID, EXPLAIN_MAX_TOKENS, EXPLAIN_RETRIES, EXPLAIN_TIMEOUT_MS, MAX_EXPLAIN_CHARS } from './constants.js';

/**
 * L04 Blast Radius. `GET /pulls/:id/blast` reads the persistent code index
 * through `container.repoIntel.*` — zero model calls, ever (R8). `POST
 * /pulls/:id/blast/explain` makes exactly one model call and caches it in
 * `pr_blast_summary`; every later read (GET or POST at the same head+index
 * sha) is served from that cache.
 *
 * `pr_blast_summary` is a satellite of `pull_requests` with no `pr_files`/
 * repo-intel table of its own, so this module reuses `container.reviewRepo`
 * for the PR/files lookup exactly as `smart-diff/service.ts` does, and only
 * owns a repository over its own one table.
 */
export class BlastService {
  private blastRepo: BlastRepository;

  constructor(private container: Container) {
    this.blastRepo = new BlastRepository(container.db);
  }

  /**
   * The tenancy gate, FIRST STATEMENT: `getPull(workspaceId, prId)` before
   * any `pr_files` or repo-intel row is read. `pull.repoId` is then the ONLY
   * source of the repo id — never `getRepo(repoId)`, which is not
   * workspace-filtered (`reviews/repository/pull.repo.ts`). None of the
   * seven repo-intel tables carry `workspace_id`, so this is the entire
   * security boundary for everything this service reads afterward.
   */
  private async loadMap(workspaceId: string, prId: string): Promise<{
    pull: PullRow;
    changedFiles: string[];
    blast: BlastResultLike;
    reverseRows: ReverseDependentRowLike[];
    indexedSha: string | null;
    mapped: MappedStatus;
  }> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const files = await this.container.reviewRepo.getPrFiles(pull.id);
    const changedFiles = files.map((f) => f.path);

    const [blast, reverseRows, state] = await Promise.all([
      this.container.repoIntel.getBlastRadius(pull.repoId, changedFiles),
      this.container.repoIntel.getReverseDependents(pull.repoId, changedFiles),
      this.container.repoIntel.getIndexState(pull.repoId),
    ]);

    const mapped = mapStatus(state, this.container.config.repoIntelEnabled);
    const indexedSha = state.lastIndexedSha || null;

    return { pull, changedFiles, blast, reverseRows, indexedSha, mapped };
  }

  /** Plain read. NEVER derives, NEVER calls a model (R6, R8) — every read on
   *  a `full` index touches Postgres only. */
  async read(workspaceId: string, prId: string): Promise<PrBlastRadius> {
    const { pull, changedFiles, blast, reverseRows, indexedSha, mapped } = await this.loadMap(workspaceId, prId);
    const summaryRow = await this.blastRepo.getSummary(pull.id);
    return toPrBlastRadius({ blast, reverseRows, changedFiles, indexedSha, mapped, summaryRow });
  }

  /**
   * Makes AT MOST one model call. Refused (no row, no call) when the map has
   * nothing to explain (`status === 'none'`) — a model asked to explain an
   * empty map would produce a fluent paragraph about nothing, exactly the
   * failure the MCP stub's docblock was written against. Otherwise reuses a
   * cached paragraph when it is fresh at BOTH the PR head sha AND the index
   * sha the map was just read at (R8's third case), and derives a new one
   * otherwise.
   */
  async explain(workspaceId: string, prId: string): Promise<PrBlastRadius> {
    const { pull, changedFiles, blast, reverseRows, indexedSha, mapped } = await this.loadMap(workspaceId, prId);

    if (mapped.status === 'none') {
      return toPrBlastRadius({ blast, reverseRows, changedFiles, indexedSha, mapped, summaryRow: undefined });
    }

    const existing = await this.blastRepo.getSummary(pull.id);
    if (existing && isSummaryFresh(existing, pull.headSha, indexedSha)) {
      return toPrBlastRadius({ blast, reverseRows, changedFiles, indexedSha, mapped, summaryRow: existing });
    }

    const downstream = groupDownstream(blast.changedSymbols, blast.callers, blast.factsByFile);
    const reverse = buildReverseImpact(changedFiles, reverseRows);
    const messages = buildExplainPrompt({
      prTitle: pull.title,
      status: mapped.status,
      reason: mapped.reason,
      changedSymbols: blast.changedSymbols,
      downstream,
      reverse,
    });

    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, EXPLAIN_FEATURE_MODEL_ID);
    const llm = await this.container.llm(provider);
    const result = await withRetry(
      () =>
        withTimeout(
          llm.complete({ model, messages, maxTokens: EXPLAIN_MAX_TOKENS }),
          EXPLAIN_TIMEOUT_MS,
        ),
      { retries: EXPLAIN_RETRIES },
    );

    await this.blastRepo.upsertSummary(pull.id, {
      explanation: result.text.slice(0, MAX_EXPLAIN_CHARS),
      derivedFromSha: pull.headSha,
      derivedFromIndexSha: indexedSha ?? '',
      provider,
      model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
    });

    const row = await this.blastRepo.getSummary(pull.id);
    return toPrBlastRadius({ blast, reverseRows, changedFiles, indexedSha, mapped, summaryRow: row });
  }
}
