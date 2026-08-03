import type { Container } from '../../platform/container.js';
import type { Skill, SkillImportPreview, SkillStats, SkillType, SkillVersion } from '@devdigest/shared';
import { SkillsRepository } from './repository.js';
import { toSkillDto, toSkillVersionDto } from './helpers.js';
import { ImportRejectedError, parseSkillImport } from './import.js';
import { ValidationError } from '../../platform/errors.js';

/**
 * Skills service. Business logic for the Skills tab + skill detail view.
 *
 * A Skill = name + description + type + body (markdown) + enabled. Body
 * changes are versioned via `skill_versions` (repository), mirroring how
 * `agent_versions` tracks an agent's config history.
 */

export interface CreateSkillInput {
  name: string;
  description?: string;
  type: SkillType;
  source?: Skill['source'];
  body: string;
  enabled?: boolean;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  /** Commit-message-style summary of what changed, recorded on the new
   *  version snapshot when `body` changes. Ignored otherwise. */
  message?: string;
}

export class SkillsService {
  private repo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.repo.list(workspaceId);
    return rows.map(toSkillDto);
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      source: input.source ?? 'manual',
      body: input.body,
      enabled: input.enabled,
    });
    return toSkillDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    const row = await this.repo.update(
      workspaceId,
      id,
      {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      },
      patch.message,
    );
    return row ? toSkillDto(row) : undefined;
  }

  /**
   * Config history for a skill, newest version first. Workspace-scoped:
   * returns undefined when the skill isn't in this workspace (route → 404).
   */
  async listVersions(workspaceId: string, skillId: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(skillId);
    return rows.map(toSkillVersionDto);
  }

  async getVersion(
    workspaceId: string,
    skillId: string,
    version: number,
  ): Promise<SkillVersion | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const row = await this.repo.getVersion(skillId, version);
    return row ? toSkillVersionDto(row) : undefined;
  }

  /**
   * Roll back to an older body. Never rewrites history: writes the old body
   * as a brand-new version (`message: "Restored v{n}"`), so the version list
   * only ever grows.
   */
  async restoreVersion(
    workspaceId: string,
    skillId: string,
    version: number,
  ): Promise<Skill | undefined> {
    const target = await this.repo.getVersion(skillId, version);
    if (!target) return undefined;
    const row = await this.repo.update(
      workspaceId,
      skillId,
      { body: target.body },
      `Restored v${version}`,
    );
    return row ? toSkillDto(row) : undefined;
  }

  /** Usage stats — deliberately DB-only (see SkillStats doc comment): no
   *  fabricated pull-frequency/accept-rate/findings-by-category. */
  async stats(workspaceId: string, skillId: string): Promise<SkillStats | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const [agents, versions] = await Promise.all([
      this.repo.usedByAgents(skillId),
      this.repo.listVersions(skillId),
    ]);
    return {
      agents_total: agents.length,
      agents_enabled: agents.filter((a) => a.linkEnabled).length,
      agents: agents.map((a) => ({ id: a.id, name: a.name, link_enabled: a.linkEnabled })),
      versions: versions.length,
      tokens: this.container.tokenizer.count(skill.body),
      last_changed_at: versions[0]?.createdAt.toISOString() ?? null,
    };
  }

  /** Token count for the body editor's live counter. */
  countTokens(text: string): number {
    return this.container.tokenizer.count(text);
  }

  /**
   * Parse an uploaded/pasted markdown file into a preview. Pure and
   * side-effect-free — nothing is persisted until the caller separately
   * POSTs the reviewed result to `create()`.
   */
  importPreview(filename: string, content: string): SkillImportPreview {
    try {
      return parseSkillImport(filename, content);
    } catch (err) {
      if (err instanceof ImportRejectedError) throw new ValidationError(err.message);
      throw err;
    }
  }
}
