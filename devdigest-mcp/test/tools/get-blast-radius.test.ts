/**
 * R8 — the stub answers in the wire contract's shape, and its wording cannot be
 * mistaken for an all-clear.
 *
 * The third case is the one that matters. Cases (i) and (ii) protect the later
 * lesson (a mapper written against these key names); case (iii) protects the
 * model from concluding "analysed, nothing found" from two empty arrays — the
 * only way a stub can do real damage.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/server';

import { registerGetBlastRadius } from '../../src/tools/get-blast-radius';
import { BlastRadiusWire } from '../../src/types/blast';

const REPO_ID = '11111111-1111-4111-8111-111111111111';
const REPOS = [{ id: REPO_ID, owner: 'acme', name: 'web', full_name: 'acme/web' }];

const FILES = ['src/api/client.ts', 'src/modules/reviews/routes.ts'];

type ToolHandler = (
  args: { repo: string; files: string[] },
  ctx: unknown,
) => Promise<{ structuredContent?: unknown; content: { type: string; text: string }[] }>;

/**
 * A collector standing in for `McpServer`: `registerTool` is the only method
 * this file's registrar touches, so there is no transport, no handshake and no
 * SDK behaviour in the loop — just the handler, called directly.
 */
function registerAndCapture(): { name: string; config: Record<string, unknown>; handler: ToolHandler } {
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

/** `GET /repos` only — the stub resolves the repo and calls nothing else. */
function stubApi(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith('/repos')) return new Response(JSON.stringify(REPOS), { status: 200 });
    return new Response(JSON.stringify({ error: { code: 'not_found', message: url } }), {
      status: 404,
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function callTool(repo = 'acme/web', files = FILES) {
  const { handler } = registerAndCapture();
  return handler({ repo, files }, {});
}

beforeEach(() => {
  // The client logs each request to stderr; keep the suite output readable.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('get_blast_radius (R8)', () => {
  it('returns structured content that parses against the wire contract', async () => {
    const fetchMock = stubApi();

    const result = await callTool();

    expect(BlastRadiusWire.safeParse(result.structuredContent).success).toBe(true);
    // The repo ref really was resolved — a bad one fails before any payload.
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
      'http://localhost:3001/repos',
    ]);
  });

  it('carries exactly the three wire keys, snake_case', async () => {
    stubApi();

    const result = await callTool();
    const parsed = BlastRadiusWire.parse(result.structuredContent);

    expect(Object.keys(parsed).sort()).toEqual(['changed_symbols', 'downstream', 'summary']);
    expect(parsed.changed_symbols).toEqual([]);
    expect(parsed.downstream).toEqual([]);
  });

  it('says "not implemented" and never "no impact"', async () => {
    stubApi();

    const result = await callTool();
    const { summary } = BlastRadiusWire.parse(result.structuredContent);

    expect(summary).toContain('not implemented');
    expect(summary.toLowerCase()).not.toContain('no impact');
    // It names the files it was handed, so the emptiness is visibly about the
    // missing analysis and not about these paths.
    for (const file of FILES) expect(summary).toContain(file);
  });
});
