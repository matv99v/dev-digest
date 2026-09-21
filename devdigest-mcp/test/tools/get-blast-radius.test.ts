/**
 * R12, R14 — `get_blast_radius` reaches exactly one route with a resolved PR
 * id, its widened wire schema keeps the honesty fields alive through `parse`,
 * the old `{ repo, files }` shape is rejected outright, and a degraded payload
 * is never worded as an all-clear.
 *
 * The last case is the one that matters most: `changed_symbols`/`downstream`
 * being empty is exactly what a `status: 'none'` or `'degraded'` response looks
 * like, and the only thing distinguishing that from "analysed, found nothing"
 * is the wording this test pins down.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';

import { registerGetBlastRadius } from '../../src/tools/get-blast-radius';
import { BlastRadiusWire } from '../../src/types/blast';

const REPO_ID = '11111111-1111-4111-8111-111111111111';
const PR_ID = '22222222-2222-4222-8222-222222222222';

const REPOS = [{ id: REPO_ID, owner: 'acme', name: 'web', full_name: 'acme/web' }];
const PULLS = [{ id: PR_ID, number: 42, title: 'the one', status: 'needs_review' }];

type ToolResult = {
  structuredContent?: unknown;
  content: { type: string; text: string }[];
  isError?: boolean;
};
type ToolHandler = (args: { pr: string }, ctx: unknown) => Promise<ToolResult>;

/** A collector standing in for `McpServer`: `registerTool` is the only method
 *  the registrar touches, so there is no transport, no handshake and no SDK
 *  behaviour in the loop — just the handler and its input schema, captured
 *  directly. */
function registerAndCapture(): {
  name: string;
  config: Record<string, unknown>;
  handler: ToolHandler;
} {
  const captured: { name: string; config: Record<string, unknown>; handler: ToolHandler }[] = [];
  const fake = {
    registerTool(name: string, config: Record<string, unknown>, handler: ToolHandler) {
      captured.push({ name, config, handler });
    },
  };

  registerGetBlastRadius(fake as unknown as McpServer);

  const tool = captured[0];
  if (!tool) throw new Error('registerGetBlastRadius registered no tool');
  return tool;
}

/** A fully-`indexed` payload — the shape `GET /pulls/:id/blast` returns for a
 *  healthy repo, extended with whatever the caller overrides. */
function blastBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    changed_symbols: [{ name: 'buildFlowchart', file: 'src/helpers.ts', kind: 'function' }],
    downstream: [
      {
        symbol: 'buildFlowchart',
        callers: [{ name: 'GraphView', file: 'src/GraphView.tsx', line: 12 }],
        endpoints_affected: ['GET /pulls/:id/blast'],
        crons_affected: [],
      },
    ],
    summary: 'indexed: 1 changed symbol, 1 caller, 1 endpoint potentially affected.',
    status: 'indexed',
    reason: null,
    indexed_sha: 'abc1234',
    callers_truncated: false,
    reverse: [],
    explanation: null,
    ...over,
  };
}

/** Routes by path: `/repos` and `/repos/:id/pulls` for the resolver, plus
 *  `/pulls/:id/blast` for the route under test. Any other path 404s, so a case
 *  that reaches one is a visible failure, not a silent extra call. */
function stubApi(blastResponse: Record<string, unknown>): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith('/repos')) return new Response(JSON.stringify(REPOS), { status: 200 });
    if (url.endsWith(`/repos/${REPO_ID}/pulls`)) {
      return new Response(JSON.stringify(PULLS), { status: 200 });
    }
    if (url.endsWith(`/pulls/${PR_ID}/blast`)) {
      return new Response(JSON.stringify(blastResponse), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { code: 'not_found', message: url } }), {
      status: 404,
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function callTool(pr = 'acme/web#42') {
  const { handler } = registerAndCapture();
  return handler({ pr }, {});
}

beforeEach(() => {
  // The client logs each request to stderr; keep the suite output readable.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('get_blast_radius (R12, R14)', () => {
  it('the only fetches are the resolver\'s and /pulls/:id/blast', async () => {
    const fetchMock = stubApi(blastBody());

    const result = await callTool();

    expect(BlastRadiusWire.safeParse(result.structuredContent).success).toBe(true);
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
      'http://localhost:3001/repos',
      `http://localhost:3001/repos/${REPO_ID}/pulls`,
      `http://localhost:3001/pulls/${PR_ID}/blast`,
    ]);
  });

  it('structuredContent keeps status, reason and indexed_sha after BlastRadiusWire.parse', async () => {
    stubApi(
      blastBody({
        status: 'partial',
        reason: 'rank may be incomplete on a partial index',
        indexed_sha: 'deadbeef',
      }),
    );

    const result = await callTool();
    const parsed = BlastRadiusWire.parse(result.structuredContent);

    expect(parsed.status).toBe('partial');
    expect(parsed.reason).toBe('rank may be incomplete on a partial index');
    expect(parsed.indexed_sha).toBe('deadbeef');
  });

  it('a { repo, files } argument is rejected by the input schema', () => {
    const { config } = registerAndCapture();
    const schema = config.inputSchema as z.ZodTypeAny;

    const result = schema.safeParse({ repo: 'acme/web', files: ['src/a.ts'] });

    expect(result.success).toBe(false);
  });

  it('a degraded payload\'s summary never says the change is safe', async () => {
    stubApi(
      blastBody({
        changed_symbols: [],
        downstream: [],
        reverse: [],
        status: 'degraded',
        reason: 'repo-intel is disabled for this workspace',
        callers_truncated: false,
        summary: 'degraded: repo-intel is disabled for this workspace. 0 changed symbols found.',
      }),
    );

    const result = await callTool();
    const parsed = BlastRadiusWire.parse(result.structuredContent);

    expect(parsed.status).toBe('degraded');
    expect(parsed.summary).toContain('degraded');
    expect(parsed.summary.toLowerCase()).not.toMatch(/no impact|safe|all.clear/);
  });
});
