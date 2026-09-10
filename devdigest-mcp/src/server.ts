/**
 * The composition root. This is the only file in the package that imports
 * across every lane boundary: it knows the five tools, the three resources and
 * the one-line `instructions`, and nothing else knows about it.
 *
 * Two things live here and nowhere else:
 *
 * 1. **The registration order.** The five `register*` functions are called in a
 *    fixed source order — `list_agents`, `run_agent_on_pr`, `get_findings`,
 *    `get_conventions`, `get_blast_radius`. `test/server.test.ts` asserts the
 *    registered *set* equals those five names (R2), not the order; the order is
 *    fixed here so that what a client sees does not depend on anything the
 *    protocol does or does not guarantee. See the era note below.
 * 2. **The transport.** `serveStdio` is a *function* in v2, taking a factory —
 *    not v1's `new StdioServerTransport()` + `server.connect(transport)`. The
 *    factory is called once per connection and the instance it returns is
 *    pinned for that connection's lifetime, which is why `createServer()`
 *    builds a fresh server on every call rather than returning a singleton.
 *
 * ## Protocol era (the Phase-0 outcome, recorded)
 *
 * The probe settled it on 2026-09-08: the negotiated revision is **`2025-11-25`
 * — legacy**, not `2026-07-28`. The installed `@modelcontextprotocol/server`'s
 * own `SUPPORTED_PROTOCOL_VERSIONS` tops out at `2025-11-25`, so this is a
 * property of the server package rather than of whichever client connects — no
 * client can raise it. Evidence and its limits: `README.md` § *Protocol era*.
 *
 * Three `2026-07-28` affordances are therefore **deliberately not relied on**
 * anywhere in this package, and could not be even if a caller wanted them:
 *
 * - **deterministic `tools/list` ordering** — the tools are registered in a
 *   fixed source order below regardless, so no behaviour and no test depends on
 *   the order the client reports;
 * - **`ttlMs` / `cacheScope` result caching** — no tool or resource declares
 *   either; every call is a fresh API call;
 * - **the `io.modelcontextprotocol/tasks` extension** — `run_agent_on_pr` polls
 *   `GET /pulls/:id/runs` to wait for a review, which works on any era.
 *
 * If a future SDK raises the ceiling, none of the above becomes wrong; they
 * become available, and adopting them is a separate decision.
 *
 * ## stdout
 *
 * stdout is the JSON-RPC channel. Everything this file says goes through
 * `log` (stderr). A stray `console.log` here would corrupt the protocol with no
 * error and no clue as to why — hence the CI guard.
 */
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { instructions } from './instructions';
import { log } from './log';
import { registerResources } from './resources/index';
import { registerGetBlastRadius } from './tools/get-blast-radius';
import { registerGetConventions } from './tools/get-conventions';
import { registerGetFindings } from './tools/get-findings';
import { registerListAgents } from './tools/list-agents';
import { registerRunAgentOnPr } from './tools/run-agent-on-pr';

/** The name a client shows for this server, and the name in root `.mcp.json`. */
export const SERVER_NAME = 'devdigest';

/** Not the package version: the surface's version, bumped when tools change. */
export const SERVER_VERSION = '0.1.0';

/**
 * Registers the five tools and the three resources onto an already-built
 * server, in a fixed source order.
 *
 * Split out from {@link createServer} so `test/server.test.ts` can pass a fake
 * whose `registerTool` only collects names — the R2 assertion is about which
 * tools are registered, and constructing a real transport to find that out
 * would test the SDK rather than this file.
 */
export function registerAll(server: McpServer): void {
  registerListAgents(server);
  registerRunAgentOnPr(server);
  registerGetFindings(server);
  registerGetConventions(server);
  registerGetBlastRadius(server);

  // Resources, not tools: they cost nothing at session start, which is why the
  // reference prose lives there and `instructions` stays one line (R11).
  registerResources(server);
}

/** Builds one fully registered server. One call per connection — see above. */
export function createServer(): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: { tools: {}, resources: {} },
      // One sentence, billed every turn of every session this server is
      // connected to. See `src/instructions.ts` for why it is not a paragraph.
      instructions,
    },
  );

  registerAll(server);
  return server;
}

/**
 * True when this module is the process entry point.
 *
 * The transport must not start when a test — or any other module — imports this
 * file, but the file still has to be directly runnable, because both `.mcp.json`
 * (`npx tsx devdigest-mcp/src/server.ts`) and the harness
 * (`npm run call -- src/server.ts <tool>`) name it as the entry.
 *
 * `process.argv[1]` is not always the same string as `import.meta.url`: Node's
 * ESM loader resolves symlinks while `argv[1]` keeps the path as given, so both
 * the literal and the realpath'd form are compared.
 */
function invokedDirectly(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;

  const asGiven = pathToFileURL(entry).href;
  let resolved = asGiven;
  try {
    resolved = pathToFileURL(realpathSync(entry)).href;
  } catch {
    // Unreadable entry path — fall back to the literal comparison.
  }

  return import.meta.url === asGiven || import.meta.url === resolved;
}

if (invokedDirectly()) {
  const handle = serveStdio(createServer, {
    onerror: (error) => log.error(`stdio transport error: ${error.message}`),
  });

  const shutdown = () => {
    void handle.close();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  log.info(
    `${SERVER_NAME} v${SERVER_VERSION} serving over stdio · API ` +
      `${process.env.DEVDIGEST_API_BASE ?? 'http://localhost:3001'}`,
  );
}
