/**
 * Human refs → uuids (R9).
 *
 * **None of the five tools returns a PR id or a repo id**, so `owner/repo#N`
 * and `owner/repo` are not a convenience — they are the only way an agent can
 * name a PR at all. A uuid still passes through untouched, because a tool that
 * already has one (from a previous result, or from the user) must not pay for a
 * lookup it does not need.
 *
 * **`resolvePr` is not free and not read-only upstream.** Resolving a PR ref
 * calls `GET /repos/:id/pulls`, which syncs from GitHub and backfills diff
 * stats for up to 10 PRs (`server/src/modules/pulls/routes.ts:78-110`). That is
 * why the uuid short-circuit is first and why every tool description that can
 * trigger this says so. `resolveRepo` calls `GET /repos`, which does not sync.
 *
 * When nothing matches, the thrown message names what was searched **and lists
 * what was found**. The agent then retries with a real name instead of calling
 * a second tool to discover one — there is no `list_repos` tool, and the scope
 * is five tools, so this message is the only listing an agent will ever get.
 */
import { apiGet } from './client';
import type { PrMetaLite, RepoLite } from './types';

/** A ref that failed to resolve. Distinct from `ApiError`: the API answered
 *  perfectly well, the name just does not exist. Tools surface `message` — it
 *  is written to be read by the model, not by a log. */
export class ResolveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResolveError';
  }
}

/** Postgres `uuid` as the API serializes it. Anything matching this is passed
 *  through without a lookup; anything else must be a human ref. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `owner/repo` — no `#`, no whitespace, exactly one slash. */
const REPO_REF_RE = /^([^/\s#]+)\/([^/\s#]+)$/;

/** `owner/repo#123`. */
const PR_REF_RE = /^([^/\s#]+)\/([^/\s#]+)#(\d+)$/;

export function isUuid(ref: string): boolean {
  return UUID_RE.test(ref.trim());
}

/** Truncated so a workspace with 200 repos does not turn one miss into a wall
 *  of text the model has to read past. */
function listCandidates(items: string[], cap = 25): string {
  if (items.length === 0) return 'none';
  const shown = items.slice(0, cap).join(', ');
  return items.length > cap ? `${shown}, … (${items.length} total)` : shown;
}

/**
 * `repo` → repo uuid. Accepts a uuid (returned as-is, **zero** HTTP calls) or
 * `owner/repo`, matched case-insensitively against `full_name` from
 * `GET /repos`.
 */
export async function resolveRepo(ref: string): Promise<string> {
  const trimmed = ref.trim();
  if (trimmed.length === 0) {
    throw new ResolveError('Empty repo reference. Pass a repo uuid or `owner/repo`.');
  }
  if (isUuid(trimmed)) return trimmed;

  const match = REPO_REF_RE.exec(trimmed);
  if (!match) {
    throw new ResolveError(
      `\`${trimmed}\` is not a repo reference. Pass a repo uuid, or \`owner/repo\` ` +
        '(for example `acme/web`).',
    );
  }

  const repos = await apiGet<RepoLite[]>('/repos');
  const wanted = trimmed.toLowerCase();
  const hit = repos.find((r) => r.full_name?.toLowerCase() === wanted);
  if (hit) return hit.id;

  throw new ResolveError(
    `No repo named \`${trimmed}\` is imported in this workspace. ` +
      `Imported repos: ${listCandidates(repos.map((r) => r.full_name))}. ` +
      'Import it in the DevDigest UI first, or retry with one of the names above.',
  );
}

/**
 * `pr` → PR uuid. Accepts a uuid (returned as-is, **zero** HTTP calls) or
 * `owner/repo#N`, which resolves the repo and then finds `number === N` in
 * `GET /repos/:id/pulls`.
 *
 * A repo that does not exist fails as a `ResolveError` from `resolveRepo`; the
 * message is deliberately not caught and rewritten here, because "no such repo"
 * and "no such PR in that repo" are different retries.
 */
export async function resolvePr(ref: string): Promise<string> {
  const trimmed = ref.trim();
  if (trimmed.length === 0) {
    throw new ResolveError('Empty pull-request reference. Pass a PR uuid or `owner/repo#N`.');
  }
  if (isUuid(trimmed)) return trimmed;

  const match = PR_REF_RE.exec(trimmed);
  if (!match) {
    throw new ResolveError(
      `\`${trimmed}\` is not a pull-request reference. Pass a PR uuid, or \`owner/repo#N\` ` +
        '(for example `acme/web#42`).',
    );
  }
  const [, owner, name, numberText] = match;
  const repoRef = `${owner}/${name}`;
  const number = Number(numberText);

  const repoId = await resolveRepo(repoRef);
  const pulls = await apiGet<PrMetaLite[]>(`/repos/${repoId}/pulls`);
  const hit = pulls.find((p) => p.number === number);
  if (hit?.id) return hit.id;

  // `hit` without an `id` lands here too: the PR is known but not persisted, so
  // there is no uuid to review against — the same retry advice applies.
  throw new ResolveError(
    `No pull request #${number} in \`${repoRef}\`. ` +
      `PRs currently imported for that repo: ${listCandidates(pulls.map((p) => `#${p.number}`))}. ` +
      'Retry with one of those numbers.',
  );
}
