import type { SmartDiff } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { buildSmartDiff } from './helpers.js';

/**
 * Smart Diff (L03) — the use case: read `pr_files` + `findings` for a PR
 * (both already owned by `ReviewRepository`, reached via `container.reviewRepo`
 * per onion-architecture — a service reading another module's repository
 * through `container.*Repo` is an inward arrow, so no second repository is
 * added over `pr_files`), then hand them to the one pure `buildSmartDiff`
 * call. No new table, no cache, no model call anywhere in this path (R4).
 */
export class SmartDiffService {
  constructor(private container: Container) {}

  /**
   * Tenancy gate FIRST (R1): `getPull` is the first statement, before any
   * satellite table is read, so a PR outside the caller's workspace 404s
   * without `pr_files` or `findings` ever being touched — `pr_files` and
   * `findings` carry no `workspace_id` of their own; they're reached only
   * through `pull_requests`, which does.
   */
  async build(workspaceId: string, prId: string): Promise<SmartDiff> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const [files, reviews] = await Promise.all([
      this.container.reviewRepo.getPrFiles(prId),
      this.container.reviewRepo.reviewsForPull(prId),
    ]);
    const findings = reviews.flatMap((r) => r.findings);

    return buildSmartDiff(files, findings);
  }
}
