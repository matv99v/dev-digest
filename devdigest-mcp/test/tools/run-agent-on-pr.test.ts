/**
 * The `run_agent_on_pr` handler end to end, with the API scripted.
 *
 * `poll.test.ts` owns the waiting rules (R4, R5) and the no-target branch
 * (R10). What is left — and what only shows up once the whole handler runs — is
 * the sequencing: the review is POSTed **once**, the reviews are read only
 * after the runs go terminal, and only this call's runs are read back.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerRunAgentOnPr } from '../../src/tools/run-agent-on-pr';

const PR_ID = '44444444-4444-4444-8444-444444444444';
const RUN_ID = '55555555-5555-4555-8555-555555555555';
const OTHER_RUN_ID = '66666666-6666-4666-8666-666666666666';

type Handler = (args: Record<string, unknown>, ctx: unknown) => Promise<{ content: unknown[] }>;

/** The tool file's only contact with the SDK is `registerTool`, so a two-line
 *  fake is enough to get at the handler — no transport and no session. */
function handlerUnderTest(): Handler {
  let captured: Handler | undefined;
  registerRunAgentOnPr({
    registerTool: (_n: string, _c: unknown, cb: unknown) => {
      captured = cb as Handler;
    },
  } as never);
  if (!captured) throw new Error('registerRunAgentOnPr registered no handler');
  return captured;
}

const DONE_RUN = {
  run_id: RUN_ID,
  agent_id: 'agent-1',
  agent_name: 'Security Reviewer',
  status: 'done',
  error: null,
  duration_ms: 12000,
  score: 71,
  findings_count: 1,
  blockers: 1,
  cost_usd: 0.02,
  ran_at: '2026-09-08T10:00:00.000Z',
};

const REVIEWS = [
  {
    id: 'review-mine',
    pr_id: PR_ID,
    agent_id: 'agent-1',
    run_id: RUN_ID,
    agent_name: 'Security Reviewer',
    kind: 'review',
    verdict: 'request_changes',
    score: 71,
    summary: 'One blocker.',
    model: 'claude-opus-5',
    created_at: '2026-09-08T10:00:12.000Z',
    findings: [
      {
        id: 'f-1',
        severity: 'CRITICAL',
        category: 'security',
        title: 'Unparameterised query',
        file: 'src/search.ts',
        start_line: 41,
        end_line: 44,
        rationale: 'SENTINEL_RATIONALE_from_this_run',
        suggestion: 'SENTINEL_SUGGESTION_from_this_run',
        confidence: 0.9,
      },
    ],
  },
  {
    id: 'review-older',
    pr_id: PR_ID,
    agent_id: 'agent-2',
    run_id: OTHER_RUN_ID,
    agent_name: 'Style Reviewer',
    kind: 'review',
    verdict: 'comment',
    score: 90,
    summary: 'SENTINEL_SUMMARY_from_an_earlier_run',
    model: 'claude-opus-5',
    created_at: '2026-09-01T10:00:00.000Z',
    findings: [],
  },
];

/** Routes by path and method so a case can assert *what* was called, not just
 *  how often. `runsScript` is consumed one entry per poll, last entry repeats. */
function stubApi(runsScript: unknown[][]): ReturnType<typeof vi.fn> {
  let poll = 0;
  const fetchMock = vi.fn(async (url: string, init?: { method?: string }) => {
    if (init?.method === 'POST' && url.endsWith(`/pulls/${PR_ID}/review`)) {
      return new Response(
        JSON.stringify({
          pr_id: PR_ID,
          runs: [{ run_id: RUN_ID, agent_id: 'agent-1', agent_name: 'Security Reviewer' }],
        }),
        { status: 200 },
      );
    }
    if (url.endsWith(`/pulls/${PR_ID}/runs`)) {
      const body = runsScript[Math.min(poll, runsScript.length - 1)] ?? [];
      poll += 1;
      return new Response(JSON.stringify(body), { status: 200 });
    }
    if (url.endsWith(`/pulls/${PR_ID}/reviews`)) {
      return new Response(JSON.stringify(REVIEWS), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { code: 'not_found', message: url } }), {
      status: 404,
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function bodyText(result: { content: unknown[] }): string {
  const first = result.content[0] as { text?: string } | undefined;
  return first?.text ?? '';
}

const ctx = () => ({ mcpReq: { _meta: { progressToken: 1 }, notify: vi.fn() } });

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('run_agent_on_pr', () => {
  it('POSTs the review once, waits, and returns only this run\'s findings', async () => {
    const fetchMock = stubApi([[DONE_RUN]]);
    const handler = handlerUnderTest();

    const pending = handler(
      { pr: PR_ID, agent_id: 'agent-1', timeout_s: 600 },
      ctx(),
    );
    await vi.advanceTimersByTimeAsync(0);
    const body = bodyText(await pending);

    const posts = fetchMock.mock.calls.filter(
      ([, init]) => (init as { method?: string } | undefined)?.method === 'POST',
    );
    expect(posts).toHaveLength(1);
    expect(JSON.parse((posts[0]?.[1] as { body: string }).body)).toEqual({ agentId: 'agent-1' });

    expect(body).toContain('"status": "complete"');
    expect(body).toContain(RUN_ID);
    expect(body).toContain('Unparameterised query');
    // The PR's other review belongs to a run this call did not start.
    expect(body).not.toContain('SENTINEL_SUMMARY_from_an_earlier_run');
    // Completion returns the concise projection, as `get_findings` would.
    expect(body).not.toContain('SENTINEL_RATIONALE_from_this_run');
  });

  it('sends `{all: true}` when asked for every agent', async () => {
    const fetchMock = stubApi([[DONE_RUN]]);
    const handler = handlerUnderTest();

    const pending = handler({ pr: PR_ID, all_agents: true, timeout_s: 600 }, ctx());
    await vi.advanceTimersByTimeAsync(0);
    await pending;

    const post = fetchMock.mock.calls.find(
      ([, init]) => (init as { method?: string } | undefined)?.method === 'POST',
    );
    expect(JSON.parse((post?.[1] as { body: string }).body)).toEqual({ all: true });
  });

  it('returns the run ids instead of throwing when the review outlives timeout_s', async () => {
    const fetchMock = stubApi([[{ ...DONE_RUN, status: 'running', duration_ms: null, score: null }]]);
    const handler = handlerUnderTest();

    const pending = handler({ pr: PR_ID, agent_id: 'agent-1', timeout_s: 10 }, ctx());
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await pending;
    const body = bodyText(result);

    expect(result).not.toHaveProperty('isError');
    expect(body).toContain('"status": "timeout"');
    expect(body).toContain(RUN_ID);
    expect(body).toContain('get_findings');
    // Still exactly one POST, however long the wait ran.
    expect(
      fetchMock.mock.calls.filter(
        ([, init]) => (init as { method?: string } | undefined)?.method === 'POST',
      ),
    ).toHaveLength(1);
    // And the reviews were not read: there is nothing finished to read.
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/reviews'))).toBe(false);
  });

  it('surfaces an API failure as text carrying its next action', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: 'invalid_run_request', message: 'no' } }), {
            status: 400,
          }),
      ),
    );
    const handler = handlerUnderTest();

    const result = await handler({ pr: PR_ID, agent_id: 'nope', timeout_s: 600 }, ctx());

    expect(result).toHaveProperty('isError', true);
    expect(bodyText(result)).toContain('list_agents');
  });
});
