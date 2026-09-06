import type { IntentSource, PrIntentDetail, RepoRef } from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { loadPromptTemplate } from '../../platform/prompts.js';
import { withRetry, withTimeout } from '../../platform/resilience.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import type { PullRow } from '../../db/rows.js';
import { ReviewRepository, type IntentRow } from '../reviews/repository.js';
import { loadCandidateDocs, loadLinkedIssue } from './doc-loader.js';
import {
  RawIntent,
  buildIndirectSignals,
  computeConfidence,
  detectInlinePlan,
  dropUngroundedScope,
  extractDocLinks,
  isIntentFresh,
  stripBodyNoise,
  toIntentDetail,
} from './helpers.js';
import {
  DERIVE_RETRIES,
  DERIVE_TIMEOUT_MS,
  INTENT_DERIVATION_SCHEMA_NAME,
  MAX_BODY_CHARS,
  MAX_INLINE_PLAN_CHARS,
  MAX_INTENT_CHARS,
  MIN_BODY_PROSE_CHARS,
} from './constants.js';

/**
 * PR Intent Layer (L03). Gather evidence → one structured LLM call → verify
 * scope in code → compute confidence in code → upsert, reusing a fresh cache
 * whenever possible. Sits alongside `reviews/run-executor.ts` in the onion:
 * this service owns the derive-vs-reuse decision, `run-executor.ts` only
 * calls `deriveForRun` as a best-effort pre-work step (see its docblock).
 *
 * No new repository for `pr_intent` — the table is already owned by
 * `ReviewRepository` (constructed here exactly as the executor does), so
 * this service news one up rather than adding a second class on one table.
 */
export class IntentService {
  private repo: ReviewRepository;

  constructor(private container: Container) {
    this.repo = new ReviewRepository(container.db);
  }

  /** #1 — the tenancy gate. Every public entry point below EXCEPT
   *  `deriveForRun` (which receives a pull already scoped by its caller,
   *  `run-executor.ts`) goes through this first. */
  private async requirePull(workspaceId: string, prId: string): Promise<PullRow> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    return pull;
  }

  /** #2 — read the cached intent. NEVER derives — a plain read has no LLM call. */
  async read(workspaceId: string, prId: string): Promise<PrIntentDetail | null> {
    const pull = await this.requirePull(workspaceId, prId);
    const row = await this.repo.getIntentRow(prId);
    return row ? toIntentDetail(row, pull) : null;
  }

  /** #3 — reuse a fresh cached intent unless `force`; otherwise derive. */
  async derive(workspaceId: string, prId: string, opts: { force?: boolean } = {}): Promise<PrIntentDetail> {
    const pull = await this.requirePull(workspaceId, prId);
    const repoRow = await this.repo.getRepo(pull.repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');
    const { detail } = await this.deriveFor(workspaceId, pull, repoRow, opts.force ?? false);
    return detail;
  }

  /**
   * #4 — the executor's entry point (`run-executor.ts`, best-effort pre-work
   * between the diff load and the per-agent loop). `pull`/`repo` are already
   * workspace-scoped by the caller (the review route resolved them before
   * queuing any run), so no second tenancy round-trip happens here.
   *
   * NEVER throws (R7) — a derivation failure must degrade the prompt (no
   * `## Intent` section), never fail the run. The executor additionally
   * wraps this call in its own try/catch as defense in depth; this method's
   * own catch is what the acceptance criterion actually verifies.
   *
   * Returns the raw row's tokens/cost alongside `detail` for the Live Log
   * line ONLY — `PrIntentDetail` (the wire contract) deliberately omits them
   * per R11 (they're persisted on `pr_intent`, never on any `agent_runs` row).
   */
  async deriveForRun(
    workspaceId: string,
    pull: PullRow,
    repo: { owner: string; name: string },
  ): Promise<{
    intent: string;
    detail: PrIntentDetail;
    tokensIn: number | null;
    tokensOut: number | null;
    costUsd: number | null;
  } | null> {
    try {
      const { detail, row } = await this.deriveFor(workspaceId, pull, repo, false);
      return {
        intent: detail.intent,
        detail,
        tokensIn: row.tokensIn,
        tokensOut: row.tokensOut,
        costUsd: row.costUsd,
      };
    } catch {
      return null;
    }
  }

  private async deriveFor(
    workspaceId: string,
    pull: PullRow,
    repo: { owner: string; name: string },
    force: boolean,
  ): Promise<{ detail: PrIntentDetail; row: IntentRow }> {
    if (!force) {
      const existing = await this.repo.getIntentRow(pull.id);
      if (existing && isIntentFresh(existing, pull)) {
        return { detail: toIntentDetail(existing, pull), row: existing };
      }
    }

    const repoRef: RepoRef = { owner: repo.owner, name: repo.name };
    const [files, commits] = await Promise.all([this.repo.getPrFiles(pull.id), this.repo.getPrCommits(pull.id)]);
    const changedPaths = files.map((f) => f.path);
    const body = pull.body ?? '';

    const sources: IntentSource[] = [];
    const evidenceSections: string[] = [];

    // Baseline signals — always gathered, so a PR with no real documentation
    // still yields SOME intent (marked low confidence, never absent).
    const indirect = buildIndirectSignals({
      title: pull.title,
      branch: pull.branch,
      commits: commits.map((c) => ({ message: c.message })),
      changedPaths,
    });
    sources.push(...indirect.sources);
    if (indirect.text) evidenceSections.push(wrapUntrusted('pr-context', indirect.text));

    // The PR body itself — either an inline plan/spec (R12, exempt from the
    // ordinary prose cap) or ordinary prose (capped at MAX_BODY_CHARS).
    if (body.trim().length > 0) {
      const inlinePlan = detectInlinePlan(body);
      if (inlinePlan.kind) {
        sources.push({ kind: 'inline_plan', ref: inlinePlan.kind });
        evidenceSections.push(wrapUntrusted('pr-body', body.slice(0, MAX_INLINE_PLAN_CHARS)));
      } else {
        if (stripBodyNoise(body).length >= MIN_BODY_PROSE_CHARS) {
          sources.push({ kind: 'pr_body', ref: null });
        }
        evidenceSections.push(wrapUntrusted('pr-body', body.slice(0, MAX_BODY_CHARS)));
      }
    }

    // In-repo docs linked from the body — no external HTTP, ever.
    const docLinks = extractDocLinks(body);
    const docs = await loadCandidateDocs(this.container, repoRef, docLinks);
    for (const doc of docs) {
      sources.push({ kind: 'repo_doc', ref: doc.path });
      evidenceSections.push(wrapUntrusted(`doc:${doc.path}`, doc.content));
    }

    // Linked issue — resolved only via a documented closing keyword
    // (extractClosingIssueNumber); its body may itself carry an inline plan.
    const linkedIssue = await loadLinkedIssue(this.container, repoRef, body);
    if (linkedIssue) {
      sources.push({ kind: 'linked_issue', ref: String(linkedIssue.number) });
      const issueBody = linkedIssue.body ?? '';
      const issueInlinePlan = detectInlinePlan(issueBody);
      const cap = issueInlinePlan.kind ? MAX_INLINE_PLAN_CHARS : MAX_BODY_CHARS;
      evidenceSections.push(
        wrapUntrusted(`linked-issue-${linkedIssue.number}`, `${linkedIssue.title}\n\n${issueBody}`.slice(0, cap)),
      );
      if (issueInlinePlan.kind && !sources.some((s) => s.kind === 'inline_plan')) {
        sources.push({ kind: 'inline_plan', ref: issueInlinePlan.kind });
      }
    }

    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'review_intent');
    const llm = await this.container.llm(provider);
    const systemPrompt = await loadPromptTemplate('intent.system.md');
    const userContent =
      evidenceSections.join('\n\n') || 'No evidence beyond the PR title was available for this PR.';

    const result = await withRetry(
      () =>
        withTimeout(
          llm.completeStructured({
            schemaName: INTENT_DERIVATION_SCHEMA_NAME,
            schema: RawIntent,
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userContent },
            ],
          }),
          DERIVE_TIMEOUT_MS,
        ),
      { retries: DERIVE_RETRIES },
    );

    const inScope = dropUngroundedScope(result.data.in_scope, changedPaths);
    const outOfScope = dropUngroundedScope(result.data.out_of_scope, changedPaths);
    const confidence = computeConfidence(sources);

    await this.repo.upsertIntent(pull.id, {
      intent: result.data.intent.slice(0, MAX_INTENT_CHARS),
      inScope,
      outOfScope,
      confidence,
      sources,
      derivedFromSha: pull.headSha,
      provider,
      model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
    });

    const row = (await this.repo.getIntentRow(pull.id)) as IntentRow;
    return { detail: toIntentDetail(row, pull), row };
  }
}
