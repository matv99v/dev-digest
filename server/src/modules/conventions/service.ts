import type { RepoRef } from '@devdigest/shared';
import type {
  Convention,
  ConventionPatch,
  ConventionScan,
  ConventionSkillDraft,
  ConventionSkillDraftMode,
  Skill,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { loadPromptTemplate } from '../../platform/prompts.js';
import { withRetry, withTimeout } from '../../platform/resilience.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { SkillsService } from '../skills/service.js';
import { ConventionsRepository, type ConventionRow } from './repository.js';
import { sampleConfigFiles, sampleRepoFiles, renderSampledFilesForPrompt, type SampledFile } from './sampler.js';
import {
  RawConventionCandidates,
  buildSkillDrafts,
  toConventionDto,
  verifyCandidates,
} from './helpers.js';
import {
  CONVENTION_EXTRACTION_SCHEMA_NAME,
  EXTRACT_RETRIES,
  EXTRACT_TIMEOUT_MS,
} from './constants.js';

/**
 * Conventions Extractor. Sample → one structured LLM call → verify in code →
 * persist, all SYNCHRONOUSLY within one request (no job queue — JobRunner's
 * 120s timeout and the lack of a `GET /jobs/:id` status route in this
 * codebase make a synchronous route simpler here; see the module's routes.ts
 * docblock for the full rationale).
 */
export class ConventionsService {
  private repo: ConventionsRepository;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
  }

  /** List this repo's conventions + scan metadata, shaped as `ConventionScan`. */
  async list(workspaceId: string, repoId: string): Promise<ConventionScan> {
    const rows = await this.repo.list(workspaceId, repoId);
    const meta = await this.repo.getScanMeta(workspaceId, repoId);
    return {
      candidates: rows.map(toConventionDto),
      // A plain listing has no record of a past scan's runtime stats (sample
      // count, drop count aren't persisted columns — there's no "scans"
      // table) — only a fresh POST /extract call observes those live. 0 here
      // just means "not available from this read path", not "zero samples".
      sampled_files: 0,
      dropped_unverified: 0,
      scanned_sha: meta.scannedSha,
      scanned_at: meta.scannedAt,
    };
  }

  /**
   * Run the scan: sample code, one structured LLM call, verify every
   * candidate against the actual sampled text, then replace this repo's
   * convention rows with the verified set (all inside one transaction).
   */
  async extract(workspaceId: string, repoId: string): Promise<ConventionScan> {
    const repoBasics = await this.repo.getRepoBasics(workspaceId, repoId);
    if (!repoBasics) throw new NotFoundError('Repo not found');

    const repoRef: RepoRef = { owner: repoBasics.owner, name: repoBasics.name };

    const [configFiles, sampledFiles, scannedSha] = await Promise.all([
      sampleConfigFiles(this.container, repoRef),
      sampleRepoFiles(this.container, repoId, repoRef),
      this.currentHead(repoRef),
    ]);

    const allFiles: SampledFile[] = [...configFiles, ...sampledFiles];

    if (allFiles.length === 0) {
      // Nothing to scan — persist the empty result (clears any stale
      // candidates from a previous scan of a repo that has since shrunk).
      const rows = await this.persist(workspaceId, repoId, scannedSha, []);
      return this.toScan(rows, allFiles.length, 0, scannedSha);
    }

    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'conventions');
    const llm = await this.container.llm(provider);
    const systemPrompt = await loadPromptTemplate('conventions.system.md');

    const result = await withRetry(
      () =>
        withTimeout(
          llm.completeStructured({
            schemaName: CONVENTION_EXTRACTION_SCHEMA_NAME,
            schema: RawConventionCandidates,
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: renderSampledFilesForPrompt(allFiles) },
            ],
          }),
          EXTRACT_TIMEOUT_MS,
        ),
      { retries: EXTRACT_RETRIES },
    );

    const contentByPath = new Map(allFiles.map((f) => [f.path, f.content]));
    const { verified, droppedCount } = verifyCandidates(result.data, (path) => contentByPath.get(path) ?? null);

    const rows = await this.persist(workspaceId, repoId, scannedSha, verified);
    return this.toScan(rows, allFiles.length, droppedCount, scannedSha);
  }

  /** Accept / reject / edit one candidate. */
  async patch(workspaceId: string, id: string, patch: ConventionPatch): Promise<Convention | undefined> {
    const row = await this.repo.update(workspaceId, id, {
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
    });
    return row ? toConventionDto(row) : undefined;
  }

  /**
   * Compose skill drafts from accepted conventions — pure read, no LLM,
   * nothing persisted. Rejected/pending rows can never appear: `buildSkillDrafts`
   * filters to `status === 'accepted'` itself.
   */
  async skillDraft(
    workspaceId: string,
    repoId: string,
    mode: ConventionSkillDraftMode,
  ): Promise<ConventionSkillDraft[]> {
    const repoBasics = await this.repo.getRepoBasics(workspaceId, repoId);
    const acceptedRows = await this.repo.listAccepted(workspaceId, repoId);
    const repoName = repoBasics?.name ?? repoBasics?.fullName ?? 'repo';
    return buildSkillDrafts(repoName, acceptedRows, mode);
  }

  /**
   * Create a skill per draft (via `SkillsService`, not reimplemented here),
   * then stamp `skillId` back onto the source convention rows the draft cites.
   */
  async createSkillsFromDrafts(workspaceId: string, drafts: ConventionSkillDraft[]): Promise<Skill[]> {
    const skillsService = new SkillsService(this.container);
    const created: Skill[] = [];
    for (const draft of drafts) {
      const skill = await skillsService.create(workspaceId, {
        name: draft.name,
        description: draft.description,
        type: draft.type,
        source: 'extracted',
        body: draft.body,
        enabled: draft.enabled,
        evidenceFiles: draft.evidence_files,
      });
      await this.repo.stampSkillId(workspaceId, draft.convention_ids, skill.id);
      created.push(skill);
    }
    return created;
  }

  private async currentHead(repoRef: RepoRef): Promise<string | null> {
    try {
      return await this.container.git.currentHead(repoRef);
    } catch {
      // Best-effort — a repo that hasn't been cloned yet just gets a null sha.
      return null;
    }
  }

  /** Open the transaction here (service owns it, per onion-architecture); replace + return. */
  private async persist(
    workspaceId: string,
    repoId: string,
    scannedSha: string | null,
    verified: ReturnType<typeof verifyCandidates>['verified'],
  ): Promise<ConventionRow[]> {
    return this.container.db.transaction(async (tx) => {
      const repo = new ConventionsRepository(tx);
      return repo.replaceForRepo(
        workspaceId,
        repoId,
        scannedSha,
        verified.map((c) => ({
          rule: c.rule,
          category: c.category,
          evidencePath: c.evidence_path,
          evidenceSnippet: c.evidence_snippet,
          evidenceLineStart: c.evidence_line_start,
          evidenceLineEnd: c.evidence_line_end,
          confidence: c.confidence,
          scannedSha,
        })),
      );
    });
  }

  private toScan(
    rows: ConventionRow[],
    sampledFileCount: number,
    droppedCount: number,
    scannedSha: string | null,
  ): ConventionScan {
    return {
      candidates: rows.map(toConventionDto),
      sampled_files: sampledFileCount,
      dropped_unverified: droppedCount,
      scanned_sha: scannedSha,
      scanned_at: rows[0]?.createdAt.toISOString() ?? new Date().toISOString(),
    };
  }
}
