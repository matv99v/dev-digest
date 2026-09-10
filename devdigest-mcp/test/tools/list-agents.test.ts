/**
 * R3 — `list_agents` never emits an agent's system prompt, on any path.
 *
 * The compile-time half of R3 lives in `src/api/types.ts` (`AgentSummary` has
 * no `system_prompt` field). This is the run-time half, and it is the half that
 * can actually break: the rows come from `fetch`, so TypeScript has no say over
 * what they carry, and a `{ ...row }` spread would typecheck while leaking the
 * prompt verbatim. The sentinel is asserted against the *serialized* result for
 * that reason — the assertion is about bytes on the wire, not about a type.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/server';

import { registerListAgents } from '../../src/tools/list-agents';

const SENTINEL = 'SENTINEL_SYSTEM_PROMPT';

const AGENTS = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: 'Security reviewer',
    description: 'Looks for injection and authz gaps',
    provider: 'anthropic',
    model: 'claude-opus-5',
    system_prompt: SENTINEL,
    output_schema: { type: 'object', properties: { leak: { const: SENTINEL } } },
    enabled: true,
    version: 3,
    strategy: 'single-pass',
    ci_fail_on: 'critical',
    repo_intel: true,
  },
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    name: 'Retired reviewer',
    description: 'Switched off',
    provider: 'openai',
    model: 'gpt-4o',
    system_prompt: SENTINEL,
    enabled: false,
    version: 1,
    strategy: 'auto',
    ci_fail_on: 'never',
    repo_intel: false,
  },
];

/** Captures what the tool registers, so a case exercises the real schema (and
 *  its defaults) and the real handler rather than a re-declaration of them. */
type Captured = {
  name: string;
  config: { description?: string; inputSchema?: { parse: (v: unknown) => unknown }; _meta?: Record<string, unknown> };
  handler: (args: never, ctx: unknown) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>;
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

async function callTool(tool: Captured, input: unknown) {
  // Parse through the tool's own schema so defaults are applied exactly as the
  // SDK would apply them before invoking the handler.
  const args = tool.config.inputSchema?.parse(input) ?? input;
  return tool.handler(args as never, {});
}

function stubAgents(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(AGENTS), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  // `client.ts` logs every request to stderr; keep the suite output readable.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('list_agents (R3, R12)', () => {
  it('returns agent ids without the system prompt or the output schema', async () => {
    stubAgents();
    const tool = captureTool(registerListAgents);

    const result = await callTool(tool, {});
    const serialized = JSON.stringify(result);

    // R3, both halves of the assertion the plan names.
    expect(serialized).not.toContain('system_prompt');
    expect(serialized).not.toContain(SENTINEL);
    // `output_schema` is dropped by the same field-by-field projection.
    expect(serialized).not.toContain('output_schema');

    // …and the tool is still useful: the ids `run_agent_on_pr` needs came back.
    expect(serialized).toContain('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(serialized).toContain('claude-opus-5');
  });

  it('registers under the expected name, with the R12 result cap and a read-only annotation', () => {
    stubAgents();
    const tool = captureTool(registerListAgents);

    expect(tool.name).toBe('list_agents');
    expect(tool.config._meta?.['anthropic/maxResultSizeChars']).toBe(100000);
    // The description is the tool-search corpus — these words are what a query
    // is matched against, so their presence is a property, not prose.
    for (const word of ['agent', 'reviewer', 'configured', 'id', 'model', 'provider']) {
      expect(tool.config.description?.toLowerCase()).toContain(word);
    }
  });

  it('hides disabled agents under enabled_only and says how many it hid', async () => {
    stubAgents();
    const tool = captureTool(registerListAgents);

    const result = await callTool(tool, { enabled_only: true });
    const payload = JSON.parse(result.content[0]!.text) as {
      agents: Array<{ id: string }>;
      total_configured: number;
      hidden_by_enabled_only: number;
      note?: string;
    };

    expect(payload.agents).toHaveLength(1);
    expect(payload.total_configured).toBe(2);
    expect(payload.hidden_by_enabled_only).toBe(1);
    // R12 — the count names the parameter that brings the rows back.
    expect(payload.note).toContain('enabled_only');
  });

  it('surfaces an API failure as tool-visible text with a next action', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: 'internal_error', message: 'boom' } }), {
            status: 500,
          }),
      ),
    );
    const tool = captureTool(registerListAgents);

    const result = await callTool(tool, {});

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('db:seed');
  });
});
