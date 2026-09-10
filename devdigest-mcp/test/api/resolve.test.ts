/**
 * R9 — human refs resolve, uuids cost nothing, and a miss lists what exists.
 *
 * The third case is the one that matters most in use: with only five tools and
 * none of them returning a repo or PR id, the not-found message is the *only*
 * listing an agent will ever see, so it has to carry the names it searched
 * against.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolvePr, resolveRepo } from '../../src/api/resolve';

const REPO_ID = '11111111-1111-4111-8111-111111111111';
const PR_ID = '22222222-2222-4222-8222-222222222222';

const REPOS = [{ id: REPO_ID, owner: 'acme', name: 'web', full_name: 'acme/web' }];
const PULLS = [
  { id: '33333333-3333-4333-8333-333333333333', number: 7, title: 'older', status: 'reviewed' },
  { id: PR_ID, number: 42, title: 'the one', status: 'needs_review' },
];

/** Routes by path, so a case asserts *what* was fetched and not just how often. */
function stubApi(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith('/repos')) {
      return new Response(JSON.stringify(REPOS), { status: 200 });
    }
    if (url.endsWith(`/repos/${REPO_ID}/pulls`)) {
      return new Response(JSON.stringify(PULLS), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { code: 'not_found', message: url } }), {
      status: 404,
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  // The client logs each request to stderr; keep the suite output readable.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('resolveRepo / resolvePr (R9)', () => {
  it('passes a uuid through without touching the API', async () => {
    const fetchMock = stubApi();

    await expect(resolveRepo(REPO_ID)).resolves.toBe(REPO_ID);
    await expect(resolvePr(PR_ID)).resolves.toBe(PR_ID);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resolves `acme/web#42` to the PR uuid', async () => {
    const fetchMock = stubApi();

    await expect(resolvePr('acme/web#42')).resolves.toBe(PR_ID);

    // Repo first, then that repo's pulls — and nothing else. The pulls call
    // syncs from GitHub server-side, so a second one is not free.
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
      'http://localhost:3001/repos',
      `http://localhost:3001/repos/${REPO_ID}/pulls`,
    ]);
  });

  it('names the repos it did find when the ref matches none', async () => {
    stubApi();

    await expect(resolveRepo('other/thing')).rejects.toThrow(/acme\/web/);
  });
});
