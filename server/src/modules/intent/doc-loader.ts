import type { IssueMeta, RepoRef } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { extractClosingIssueNumber, resolveRepoDocPath } from './helpers.js';
import { MAX_DOC_BYTES, MAX_DOCS } from './constants.js';

/**
 * Evidence gathering through the ports (T7) — shaped like
 * `modules/conventions/sampler.ts`: takes a `Container`, reads through the
 * `GitClient`/`GitHubClient` ports, and degrades to less evidence rather than
 * throwing. NO `fetch`, NO `URL`, ever — `resolveRepoDocPath` (helpers.ts)
 * has already rejected anything but an in-repo `.md` path before this file
 * ever calls `readFile`.
 */

export interface LoadedDoc {
  path: string;
  content: string;
}

/**
 * Read at most `MAX_DOCS` resolved in-repo doc candidates via
 * `container.git.readFile`, each in its OWN try/catch. Both a try/catch AND
 * a falsy-content check are required to skip a missing file gracefully on
 * BOTH implementations of the port: the real `SimpleGitClient.readFile`
 * REJECTS (ENOENT) for a path that isn't in the clone, while
 * `MockGitClient.readFile` instead RESOLVES to `''` for the same case
 * (server/INSIGHTS.md, 2026-09-01) — dropping either guard passes against
 * only one of the two.
 *
 * Candidates are resolved/deduped BEFORE any read is attempted, and capped
 * at `MAX_DOCS` at that point — an unbounded body of links must not turn one
 * derivation into dozens of reads.
 */
export async function loadCandidateDocs(
  container: Container,
  repoRef: RepoRef,
  candidateLinks: readonly string[],
): Promise<LoadedDoc[]> {
  const resolvedPaths: string[] = [];
  for (const raw of candidateLinks) {
    if (resolvedPaths.length >= MAX_DOCS) break;
    const resolved = resolveRepoDocPath(raw);
    if (resolved && !resolvedPaths.includes(resolved)) resolvedPaths.push(resolved);
  }

  const docs: LoadedDoc[] = [];
  for (const docPath of resolvedPaths) {
    try {
      const raw = await container.git.readFile(repoRef, docPath);
      if (!raw) continue;
      docs.push({ path: docPath, content: raw.slice(0, MAX_DOC_BYTES) });
    } catch {
      // Missing file (real adapter throws ENOENT), unreadable clone, etc. —
      // skip this candidate, never fail the whole gather over one bad link.
    }
  }
  return docs;
}

/**
 * Resolve the PR's linked issue (documented-closing-keyword only —
 * `extractClosingIssueNumber`) via `container.github()`, guarded exactly
 * like `modules/pulls/routes.ts`'s "no token / offline is normal" precedent.
 * Returns `null` on no match, no token, offline, or a fetch failure — never
 * throws.
 */
export async function loadLinkedIssue(
  container: Container,
  repoRef: RepoRef,
  body: string,
): Promise<IssueMeta | null> {
  const issueNumber = extractClosingIssueNumber(body);
  if (issueNumber == null) return null;
  try {
    const gh = await container.github();
    return await gh.getIssue(repoRef, issueNumber);
  } catch {
    // No token configured, offline, issue not found, etc. — normal, not a
    // failure (see modules/pulls/routes.ts's `container.github()` guard).
    return null;
  }
}
