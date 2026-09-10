/**
 * R7, R12 — `get_conventions` filters, windows, and says what it removed.
 *
 * The three cases the plan names are (i) the status filter, (ii) `concise`
 * dropping the snippet while keeping the locator, and (iii) `limit` returning
 * one row *and a stated total*. The third is the one that matters in use: a
 * truncated result the model cannot tell is truncated is how it ends up
 * reporting a partial answer as a complete one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/server';

import { registerGetConventions } from '../../src/tools/get-conventions';

const REPO_ID = '11111111-1111-4111-8111-111111111111';
const SNIPPET_A = 'SNIPPET_ALPHA_ONLY_IN_EVIDENCE';
const SNIPPET_B = 'SNIPPET_BRAVO_ONLY_IN_EVIDENCE';

const REPOS = [{ id: REPO_ID, owner: 'acme', name: 'web', full_name: 'acme/web' }];

const SCAN = {
  candidates: [
    {
      id: 'c1',
      repo_id: REPO_ID,
      category: 'error-handling',
      rule: 'Throw domain errors, never raw strings',
      evidence: {
        path: 'src/modules/pulls/service.ts',
        line_start: 40,
        line_end: 44,
        snippet: SNIPPET_A,
      },
      confidence: 0.9,
      status: 'accepted',
      scanned_sha: 'deadbeef',
      created_at: '2026-09-01T00:00:00.000Z',
    },
    {
      id: 'c2',
      repo_id: REPO_ID,
      category: 'testing',
      rule: 'DB-backed tests are named *.it.test.ts',
      evidence: { path: 'server/test/x.it.test.ts', line_start: 1, line_end: 3, snippet: SNIPPET_B },
      confidence: 0.7,
      status: 'pending',
      scanned_sha: 'deadbeef',
      created_at: '2026-09-01T00:00:00.000Z',
    },
    {
      id: 'c3',
      repo_id: REPO_ID,
      category: 'style',
      rule: 'Rejected candidate',
      evidence: { path: 'src/whatever.ts', line_start: 9, line_end: 9, snippet: 'noise' },
      confidence: 0.3,
      status: 'rejected',
      scanned_sha: 'deadbeef',
      created_at: '2026-09-01T00:00:00.000Z',
    },
  ],
  sampled_files: 120,
  dropped_unverified: 4,
  scanned_sha: 'deadbeef',
  scanned_at: '2026-09-01T00:00:00.000Z',
};

type Captured = {
  name: string;
  config: {
    description?: string;
    inputSchema?: { parse: (v: unknown) => unknown };
    _meta?: Record<string, unknown>;
  };
  handler: (
    args: never,
    ctx: unknown,
  ) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>;
};

function captureTool(register: (server: McpServer) => void): Captured {
  const captured: Captured[] = [];
  const fake = {
    registerTool: (name: string, config: Captured['config'], handler: Captured['handler']) => {
      captured.push({ name, config, handler });
      return {};
    },
  };
  register(fake as unknown as McpServer);
  const only = captured[0];
  if (!only) throw new Error('the register function registered no tool');
  return only;
}

/** Parses through the tool's own schema, so a case exercises the real defaults
 *  (`limit: 50`, `detail: 'concise'`) rather than restating them. */
async function callTool(tool: Captured, input: unknown) {
  const args = tool.config.inputSchema?.parse(input) ?? input;
  return tool.handler(args as never, {});
}

function stubApi(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith('/repos')) return new Response(JSON.stringify(REPOS), { status: 200 });
    if (url.endsWith(`/repos/${REPO_ID}/conventions`))
      return new Response(JSON.stringify(SCAN), { status: 200 });
    return new Response(JSON.stringify({ error: { code: 'not_found', message: url } }), {
      status: 404,
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function payloadOf(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0]!.text) as {
    conventions: Array<{ id: string; status: string; evidence: Record<string, unknown> }>;
    total_candidates: number;
    total_matching_filter: number;
    returned: number;
    filtered_out_by_status: number;
    truncated_by_limit: number;
    sampled_files: number;
    dropped_unverified: number;
    scanned_sha: string | null;
    notes?: string[];
  };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('get_conventions (R7, R12)', () => {
  it("returns only accepted rows under status: 'accepted', and counts what it dropped", async () => {
    stubApi();
    const tool = captureTool(registerGetConventions);

    const result = await callTool(tool, { repo: 'acme/web', status: 'accepted' });
    const payload = payloadOf(result);

    expect(payload.conventions.map((c) => c.id)).toEqual(['c1']);
    expect(payload.total_candidates).toBe(3);
    expect(payload.filtered_out_by_status).toBe(2);
    // R12 — the drop is stated with the parameter that undoes it.
    expect(payload.notes?.join(' ')).toContain('status');
  });

  it('omits the evidence snippet in concise detail but keeps the path and line range', async () => {
    stubApi();
    const tool = captureTool(registerGetConventions);

    // `detail` is not passed: `concise` is the schema default, which is the
    // behaviour that actually ships.
    const result = await callTool(tool, { repo: 'acme/web' });
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain(SNIPPET_A);
    expect(serialized).not.toContain(SNIPPET_B);
    expect(serialized).toContain('src/modules/pulls/service.ts');
    expect(payloadOf(result).conventions[0]!.evidence).toEqual({
      path: 'src/modules/pulls/service.ts',
      line_start: 40,
      line_end: 44,
    });

    const full = await callTool(tool, { repo: 'acme/web', detail: 'full' });
    expect(JSON.stringify(full)).toContain(SNIPPET_A);
  });

  it('returns one candidate under limit: 1 and still states the total', async () => {
    stubApi();
    const tool = captureTool(registerGetConventions);

    const result = await callTool(tool, { repo: 'acme/web', limit: 1 });
    const payload = payloadOf(result);

    expect(payload.conventions).toHaveLength(1);
    expect(payload.returned).toBe(1);
    // Truncated, and visibly so — with the total, the dropped count and the
    // parameter that widens the window.
    expect(payload.total_matching_filter).toBe(3);
    expect(payload.truncated_by_limit).toBe(2);
    expect(payload.notes?.join(' ')).toContain('limit');
  });

  it('resolves a repo uuid without any lookup, and reports the scan metadata', async () => {
    const fetchMock = stubApi();
    const tool = captureTool(registerGetConventions);

    const payload = payloadOf(await callTool(tool, { repo: REPO_ID }));

    // A uuid short-circuits `resolveRepo`: the conventions call is the only one.
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
      `http://localhost:3001/repos/${REPO_ID}/conventions`,
    ]);
    expect(payload.sampled_files).toBe(120);
    expect(payload.dropped_unverified).toBe(4);
    expect(payload.scanned_sha).toBe('deadbeef');
  });

  it('surfaces an unknown repo as tool-visible text naming the repos that exist', async () => {
    stubApi();
    const tool = captureTool(registerGetConventions);

    const result = await callTool(tool, { repo: 'other/thing' });

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('acme/web');
  });

  it('declares the R12 result cap', () => {
    stubApi();
    const tool = captureTool(registerGetConventions);

    expect(tool.name).toBe('get_conventions');
    expect(tool.config._meta?.['anthropic/maxResultSizeChars']).toBe(100000);
  });
});
