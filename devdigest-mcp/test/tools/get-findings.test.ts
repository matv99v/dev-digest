/**
 * The `get_findings` handler end to end.
 *
 * `test/shape/findings.test.ts` owns the projection rules (R6) as pure
 * functions. What this file covers is what only the handler can get wrong: the
 * client-side `run_id` filter (the API has no run-scoped reviews route), the
 * fact that findings from *several* reviews page as one set, and that a PR with
 * no review says so instead of returning an empty list that reads like "clean".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerGetFindings } from '../../src/tools/get-findings';

const PR_ID = '44444444-4444-4444-8444-444444444444';
const RUN_A = '55555555-5555-4555-8555-555555555555';
const RUN_B = '66666666-6666-4666-8666-666666666666';

type Handler = (args: Record<string, unknown>, ctx: unknown) => Promise<{ content: unknown[] }>;

function handlerUnderTest(): Handler {
  let captured: Handler | undefined;
  registerGetFindings({
    registerTool: (_n: string, _c: unknown, cb: unknown) => {
      captured = cb as Handler;
    },
  } as never);
  if (!captured) throw new Error('registerGetFindings registered no handler');
  return captured;
}

function finding(over: Record<string, unknown>) {
  return {
    id: 'f',
    severity: 'WARNING',
    category: 'style',
    title: 'title',
    file: 'src/a.ts',
    start_line: 1,
    end_line: 1,
    rationale: 'SENTINEL_RATIONALE',
    suggestion: null,
    confidence: 0.5,
    ...over,
  };
}

function review(over: Record<string, unknown>) {
  return {
    id: 'review',
    pr_id: PR_ID,
    agent_id: 'agent',
    run_id: RUN_A,
    agent_name: 'Reviewer',
    kind: 'review',
    verdict: 'comment',
    score: 80,
    summary: 'summary',
    model: 'claude-opus-5',
    created_at: '2026-09-08T10:00:00.000Z',
    findings: [],
    ...over,
  };
}

const REVIEWS = [
  review({
    id: 'review-a',
    run_id: RUN_A,
    findings: [
      finding({ id: 'a-critical', severity: 'CRITICAL', title: 'from run A' }),
      finding({ id: 'a-warning', severity: 'WARNING', title: 'also from run A' }),
    ],
  }),
  review({
    id: 'review-b',
    run_id: RUN_B,
    agent_name: 'Second Reviewer',
    findings: [finding({ id: 'b-critical', severity: 'CRITICAL', title: 'from run B' })],
  }),
];

function stubReviews(body: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith(`/pulls/${PR_ID}/reviews`)) {
      return new Response(JSON.stringify(body), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { code: 'not_found', message: url } }), {
      status: 404,
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function payload(result: { content: unknown[] }): Record<string, unknown> {
  const first = result.content[0] as { text?: string } | undefined;
  return JSON.parse(first?.text ?? '{}') as Record<string, unknown>;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('get_findings', () => {
  it('reads every review on the PR and pages across all of their findings', async () => {
    stubReviews(REVIEWS);

    const out = payload(await handlerUnderTest()({ pr: PR_ID, limit: 20, offset: 0 }, {}));

    expect(out.total_matching).toBe(3);
    expect((out.findings as Array<{ id: string }>).map((f) => f.id)).toEqual([
      'a-critical',
      'a-warning',
      'b-critical',
    ]);
    expect(out.reviews).toHaveLength(2);
  });

  it('narrows to one run client-side, since the API has no run-scoped route', async () => {
    stubReviews(REVIEWS);

    const out = payload(
      await handlerUnderTest()({ pr: PR_ID, run_id: RUN_B, limit: 20, offset: 0 }, {}),
    );

    expect(out.reviews).toHaveLength(1);
    expect((out.findings as Array<{ id: string }>).map((f) => f.id)).toEqual(['b-critical']);
  });

  it('composes the severity filter with the window and keeps the total stable', async () => {
    stubReviews(REVIEWS);
    const handler = handlerUnderTest();

    const first = payload(
      await handler({ pr: PR_ID, severity: ['CRITICAL'], limit: 1, offset: 0 }, {}),
    );
    const second = payload(
      await handler({ pr: PR_ID, severity: ['CRITICAL'], limit: 1, offset: 1 }, {}),
    );

    expect((first.findings as Array<{ id: string }>).map((f) => f.id)).toEqual(['a-critical']);
    expect((second.findings as Array<{ id: string }>).map((f) => f.id)).toEqual(['b-critical']);
    expect(second.total_matching).toBe(first.total_matching);
    expect(second.total_matching).toBe(2);
  });

  it('says a PR has no review rather than returning an empty finding list', async () => {
    stubReviews([]);

    const result = await handlerUnderTest()({ pr: PR_ID, limit: 20, offset: 0 }, {});

    expect(result).toHaveProperty('isError', true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('run_agent_on_pr');
  });

  it('surfaces a resolve failure with the names it searched against', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })),
    );

    const result = await handlerUnderTest()({ pr: 'acme/web#42', limit: 20, offset: 0 }, {});

    expect(result).toHaveProperty('isError', true);
    expect((result.content[0] as { text: string }).text).toContain('acme/web');
  });
});
