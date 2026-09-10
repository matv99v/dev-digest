/**
 * R2 — the server registers **exactly five** tools.
 *
 * The assertion is an equality against the sorted name array, so it fails both
 * ways: a sixth tool fails it, and a tool quietly dropped from `registerAll`
 * fails it too. That is the point — "no sixth tool" is a scope decision the
 * plan makes (`Not planned`), and a decision nothing checks is a comment.
 *
 * No transport is constructed. `registerAll` takes anything shaped like an
 * `McpServer`, so the fake below collects names and nothing else; building a
 * real stdio connection to read `tools/list` would test the SDK's transport
 * rather than this repo's composition root.
 *
 * Ordering is asserted only as this file's own call order (the fixed source
 * order `src/server.ts` documents). Nothing here asserts the order a *client*
 * reports: deterministic `tools/list` ordering is a `2026-07-28` affordance and
 * the negotiated era is `2025-11-25` (README § Protocol era).
 */
import { describe, expect, it } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/server';

import { createServer, registerAll, SERVER_NAME, SERVER_VERSION } from '../src/server';

const EXPECTED_TOOLS = [
  'get_blast_radius',
  'get_conventions',
  'get_findings',
  'list_agents',
  'run_agent_on_pr',
];

/** The order `src/server.ts` calls the five `register*` functions in. */
const SOURCE_ORDER = [
  'list_agents',
  'run_agent_on_pr',
  'get_findings',
  'get_conventions',
  'get_blast_radius',
];

type Collected = { tools: string[]; resources: string[] };

/** A fake server that records what was registered on it and nothing more. */
function collect(): Collected {
  const tools: string[] = [];
  const resources: string[] = [];

  const fake = {
    registerTool: (name: string) => {
      tools.push(name);
      return {};
    },
    registerResource: (name: string) => {
      resources.push(name);
      return {};
    },
  };

  registerAll(fake as unknown as McpServer);
  return { tools, resources };
}

describe('src/server.ts — composition root', () => {
  it('registers exactly the five planned tools, no more and no fewer', () => {
    const { tools } = collect();

    expect([...tools].sort()).toEqual(EXPECTED_TOOLS);
  });

  it('registers each tool once, in the documented source order', () => {
    const { tools } = collect();

    expect(tools).toEqual(SOURCE_ORDER);
    expect(new Set(tools).size).toBe(tools.length);
  });

  it('registers the three reference resources alongside the tools', () => {
    const { resources } = collect();

    expect([...resources].sort()).toEqual(['blast-radius', 'score-rubric', 'severity-vocabulary']);
  });

  it('builds a fresh server per call — serveStdio pins one instance per connection', () => {
    const first = createServer();
    const second = createServer();

    expect(first).toBeDefined();
    expect(second).not.toBe(first);
    expect(SERVER_NAME).toBe('devdigest');
    expect(SERVER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
