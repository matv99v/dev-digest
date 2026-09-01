import type { Skill, SkillImportPreview, SkillStats, SkillVersion } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { SkillsRepository } from './repository.js';
import { parseImport, toSkillDto, toSkillVersionDto } from './helpers.js';

/**
 * Skills service. Business logic for the Skills page + editor. A skill is
 * pure configuration — name/description/type/source + a markdown body — never
 * anything executable.
 */

export interface CreateSkillInput {
  name: string;
  description?: string;
  type?: Skill['type'];
  source?: Skill['source'];
  body: string;
  enabled?: boolean;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: Skill['type'];
  source?: Skill['source'];
  body?: string;
  enabled?: boolean;
  version_message?: string;
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

  /** Delete a skill (and its versions/agent-links, via cascade). */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type ?? 'custom',
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
    const row = await this.repo.update(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.source !== undefined ? { source: patch.source } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.version_message !== undefined ? { message: patch.version_message } : {}),
    });
    return row ? toSkillDto(row) : undefined;
  }

  /**
   * Version history for a skill, newest first. Workspace-scoped: returns
   * undefined when the skill isn't in this workspace (the route maps that to
   * 404) so version bodies can't be read across tenants.
   */
  async listVersions(workspaceId: string, skillId: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(skillId);
    return rows.map(toSkillVersionDto);
  }

  /**
   * Restore a skill to a previous body version. Returns undefined when the
   * skill or the requested version doesn't exist in this workspace.
   */
  async restore(workspaceId: string, skillId: string, version: number): Promise<Skill | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const row = await this.repo.restore(workspaceId, skillId, version);
    return row ? toSkillDto(row) : undefined;
  }

  /** Usage and finding stats for a skill. Returns undefined when not found. */
  async stats(workspaceId: string, skillId: string): Promise<SkillStats | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    return this.repo.stats(skillId);
  }

  /**
   * Parse an uploaded file into a preview of what would be created — persists
   * nothing. Supports .md and .zip only, up to 5 MB decoded.
   */
  importPreview(filename: string, contentBase64: string): SkillImportPreview {
    return parseImport(filename, Buffer.from(contentBase64, 'base64'));
  }
}
