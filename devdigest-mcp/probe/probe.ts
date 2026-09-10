/**
 * Phase-0 compatibility probe — TEMPORARY. Delete once `## Protocol era` in
 * README.md is written; the harness (`scripts/call.mjs`) that drives it is what
 * stays.
 *
 * It answers one question: which protocol era does a client negotiate with
 * `@modelcontextprotocol/server@2.0.0`, and is the per-request protocol version
 * visible to a tool handler at all?
 *
 * stdout belongs to JSON-RPC. Every diagnostic here goes to stderr through
 * `console.error` — a single stray `console.log` corrupts the protocol with no
 * error message and no clue as to why. (`src/log.ts` is a later task's; the
 * probe uses `console.error` directly.)
 */
import {
  McpServer,
  PROTOCOL_VERSION_META_KEY,
  LATEST_PROTOCOL_VERSION,
  DEFAULT_NEGOTIATED_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';

/**
 * Where the version actually lands is not where the plan assumed. In v2 the
 * handler's second argument is `ctx: ServerContext`, and the reserved
 * `io.modelcontextprotocol/*` keys are *lifted out* of the `_meta` a handler
 * sees into `ctx.mcpReq.envelope`. So both places are read, and both are
 * reported.
 */
function readProtocolVersion(ctx: {
  mcpReq: { _meta?: Record<string, unknown>; envelope?: Record<string, unknown> };
}): { observed: string; from: string } {
  const meta = ctx.mcpReq._meta as Record<string, unknown> | undefined;
  const envelope = ctx.mcpReq.envelope as Record<string, unknown> | undefined;

  const inMeta = meta?.[PROTOCOL_VERSION_META_KEY];
  if (typeof inMeta === 'string') return { observed: inMeta, from: 'ctx.mcpReq._meta' };

  const inEnvelopeFull = envelope?.[PROTOCOL_VERSION_META_KEY];
  if (typeof inEnvelopeFull === 'string')
    return { observed: inEnvelopeFull, from: 'ctx.mcpReq.envelope (full key)' };

  const inEnvelopeShort = envelope?.protocolVersion;
  if (typeof inEnvelopeShort === 'string')
    return { observed: inEnvelopeShort, from: 'ctx.mcpReq.envelope.protocolVersion' };

  return { observed: 'absent', from: 'neither _meta nor envelope' };
}

const handle = serveStdio(() => {
  const server = new McpServer(
    { name: 'devdigest-probe', version: '0.0.0' },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    'probe_era',
    {
      title: 'Protocol era probe',
      description:
        'Returns the protocol version this client negotiated, as seen by a tool handler. Phase-0 diagnostic only.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      // Second probe question, for R12: does a tool-level `_meta` survive
      // registration into the `tools/list` the client actually sees?
      _meta: { 'anthropic/maxResultSizeChars': 100000 },
    },
    async (_args, ctx) => {
      const { observed, from } = readProtocolVersion(
        ctx as unknown as {
          mcpReq: { _meta?: Record<string, unknown>; envelope?: Record<string, unknown> };
        },
      );

      const report = {
        observed_protocol_version: observed,
        read_from: from,
        meta_key: PROTOCOL_VERSION_META_KEY,
        raw_meta: ctx.mcpReq._meta ?? null,
        raw_envelope: (ctx as unknown as { mcpReq: { envelope?: unknown } }).mcpReq.envelope ?? null,
        sdk_latest_protocol_version: LATEST_PROTOCOL_VERSION,
        sdk_default_negotiated_protocol_version: DEFAULT_NEGOTIATED_PROTOCOL_VERSION,
        sdk_supported_protocol_versions: SUPPORTED_PROTOCOL_VERSIONS,
      };

      // Backup evidence, for when the tool cannot be called at all.
      console.error('[probe_era] ' + JSON.stringify(report));

      // Primary evidence: this lands in the transcript.
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(report, null, 2) }],
      };
    },
  );

  return server;
});

const shutdown = () => {
  void handle.close();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.error('[probe] devdigest-probe serving over stdio');
