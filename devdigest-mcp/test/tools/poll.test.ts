/**
 * R4, R5, R10 — the waiting half of `run_agent_on_pr`.
 *
 * Everything here is hermetic: `fetch` is a `vi.stubGlobal` script and the
 * clock is `vi.useFakeTimers()`, so a review that takes two poll intervals
 * takes microseconds and no API, database or model key is involved.
 *
 * Fake timers and an `await`ing loop need `advanceTimersByTimeAsync`, not
 * `advanceTimersByTime`: the loop yields on the stubbed `fetch` between sleeps,
 * and only the async form flushes those microtasks as it advances.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FIRST_INTERVAL_MS,
  isReapedRun,
  pollUntilTerminal,
  type PollResult,
} from '../../src/tools/poll';
import { registerRunAgentOnPr } from '../../src/tools/run-agent-on-pr';
import type { RunSummaryLite } from '../../src/api/types';

const PR_ID = '44444444-4444-4444-8444-444444444444';
const RUN_ID = '55555555-5555-4555-8555-555555555555';

function run(over: Partial<RunSummaryLite> = {}): RunSummaryLite {
  return {
    run_id: RUN_ID,
    agent_id: 'agent-1',
    agent_name: 'Security Reviewer',
    status: 'running',
    error: null,
    duration_ms: null,
    score: null,
    findings_count: null,
    blockers: null,
    cost_usd: null,
    ran_at: '2026-09-08T10:00:00.000Z',
    ...over,
  };
}

/**
 * One scripted `GET /pulls/:id/runs` response per call; the last entry repeats
 * for ever, so a timeout case can be written without counting polls.
 */
function stubRuns(script: RunSummaryLite[][]): ReturnType<typeof vi.fn> {
  let call = 0;
  const fetchMock = vi.fn(async () => {
    const body = script[Math.min(call, script.length - 1)] ?? [];
    call += 1;
    return new Response(JSON.stringify(body), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.useFakeTimers();
  // The API client logs every request to stderr; keep the suite readable.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('pollUntilTerminal (R4)', () => {
  it('does not resolve until the run reports a terminal status', async () => {
    const fetchMock = stubRuns([
      [run()],
      [run()],
      [run({ status: 'done', duration_ms: 9000, score: 82, findings_count: 3, blockers: 1 })],
    ]);

    let settled = false;
    const pending = pollUntilTerminal({
      prId: PR_ID,
      runIds: [RUN_ID],
      timeoutMs: 600_000,
    }).then((r) => {
      settled = true;
      return r;
    });

    // First poll fires immediately, sees `running`, and waits.
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);

    // Second poll: still `running`.
    await vi.advanceTimersByTimeAsync(FIRST_INTERVAL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(settled).toBe(false);

    // Third poll: `done`.
    await vi.advanceTimersByTimeAsync(FIRST_INTERVAL_MS);
    const result = await pending;

    expect(settled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.stopped_reason).toBe('terminal');
    expect(result.polls).toBe(3);
    expect(result.text).toContain('score 82/100');
    expect(result.text).toContain('3 finding(s)');
  });

  it('emits exactly one progress notification per waiting round — two, not three', async () => {
    stubRuns([[run()], [run()], [run({ status: 'done', duration_ms: 9000 })]]);
    const notify = vi.fn();

    const pending = pollUntilTerminal({
      prId: PR_ID,
      runIds: [RUN_ID],
      timeoutMs: 600_000,
      notify,
    });

    await vi.advanceTimersByTimeAsync(FIRST_INTERVAL_MS * 2);
    await pending;

    // Three polls, but the terminal one returns instead of waiting, so it has
    // no idle window to keep open and sends nothing.
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenLastCalledWith(
      expect.objectContaining({ progress: 0, total: 1, message: expect.any(String) }),
    );
  });

  it('on timeout resolves with the started run ids and points at get_findings', async () => {
    // Never terminal: the run is still going when the budget runs out.
    stubRuns([[run()]]);

    const pending = pollUntilTerminal({
      prId: PR_ID,
      runIds: [RUN_ID],
      timeoutMs: 1_000,
    });

    await vi.advanceTimersByTimeAsync(5_000);
    const result: PollResult = await pending;

    expect(result.stopped_reason).toBe('timeout');
    expect(result.run_ids).toEqual([RUN_ID]);
    expect(result.text).toContain('get_findings');
    // The one thing a timed-out caller must not do.
    expect(result.text).toContain('10/min');
  });
});

describe('reaped runs vs real failures (R5)', () => {
  it('reports a reaped run as a restart, and a real failure as itself', async () => {
    stubRuns([[run({ status: 'failed', error: null, duration_ms: null })]]);

    const reaped = await pollUntilTerminal({ prId: PR_ID, runIds: [RUN_ID], timeoutMs: 600_000 });

    expect(reaped.stopped_reason).toBe('terminal');
    expect(reaped.text).toContain('restarted mid-run');
    expect(isReapedRun(run({ status: 'failed', error: null, duration_ms: null }))).toBe(true);

    vi.unstubAllGlobals();
    stubRuns([[run({ status: 'failed', error: 'boom', duration_ms: 120 })]]);

    const failed = await pollUntilTerminal({ prId: PR_ID, runIds: [RUN_ID], timeoutMs: 600_000 });

    expect(failed.text).toContain('boom');
    // A run that failed with a real error is a review failure, and saying it
    // was a restart would send the caller to re-run instead of to the finding.
    expect(failed.text).not.toContain('restarted mid-run');
    expect(isReapedRun(run({ status: 'failed', error: 'boom', duration_ms: 120 }))).toBe(false);
  });
});

describe('run_agent_on_pr without a target (R10)', () => {
  it('returns the invalid_run_request text without touching the API', async () => {
    const fetchMock = stubRuns([[run()]]);

    // A fake server: `registerTool` is the only method the tool file calls, and
    // capturing the handler is all a test needs to drive it — no transport, no
    // client, no session.
    let handler:
      | ((args: Record<string, unknown>, ctx: unknown) => Promise<{ content: unknown[] }>)
      | undefined;
    const fakeServer = {
      registerTool: (_name: string, _config: unknown, cb: unknown) => {
        handler = cb as typeof handler;
      },
    };
    registerRunAgentOnPr(fakeServer as never);
    expect(handler).toBeDefined();

    const result = await handler!(
      { pr: 'acme/web#42' },
      { mcpReq: { _meta: {}, notify: vi.fn() } },
    );

    const text = JSON.stringify(result);
    expect(text).toContain('list_agents');
    expect(text).toContain('all_agents');
    // The whole point: resolving `acme/web#42` would have synced from GitHub
    // for a request that can never succeed.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
