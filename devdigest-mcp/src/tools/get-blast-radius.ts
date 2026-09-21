/**
 * `get_blast_radius` — the impact map for a pull request's changed files.
 *
 * The route it answers from, `GET /pulls/:id/blast`, computes the map on read
 * from the persistent code index only (zero model calls on every path, R8) and
 * is the **only** endpoint this tool reaches — it never reconstructs the map
 * client-side. `resolvePr` turns the `pr` argument into the PR uuid the route
 * needs.
 *
 * **The failure mode this tool is written against is wording, not code.** A
 * degraded or unindexed map that reads to a model as *"analysed, found no
 * impact"* is a strictly false and actively harmful conclusion, indistinguishable
 * from a real all-clear. That is why `structuredContent` carries `status` and
 * `reason` (R12) rather than only the map: a `degraded` or `none` status makes
 * the missing analysis visible instead of silent, and every endpoint or cron in
 * the result is *potentially* affected, never asserted as reached (R14). The
 * server's own `summary` states the status in prose; this tool adds nothing on
 * top of it and subtracts nothing from it.
 *
 * Errors are caught here, the `get_conventions` / `get_findings` shape
 * (`get-conventions.ts:156-163`, `get-findings.ts:85-90`), rather than left for
 * `McpServer` to turn into the same `{ isError: true, ... }` shape on its own —
 * this tool is no longer a stub with nothing else to do in its handler, and
 * every other resolver-backed tool in this package already catches. Both
 * `ResolveError.message` and `ApiError.message` are written to be read by a
 * model, so the catch is a pass-through, not a rewrap.
 */
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { apiGet } from '../api/client';
import { resolvePr } from '../api/resolve';
import { log } from '../log';
import { BlastRadiusWire } from '../types/blast';

/**
 * Tool-search corpus. A model never searches for the string
 * `get_blast_radius` — it searches for what it wants to know, so *impact*,
 * *callers*, *downstream*, *affected endpoints* and *changed symbols* lead.
 * The closing sentence is what stops a `degraded` or `none` status being read
 * as a clean bill of health.
 */
const DESCRIPTION =
  'Impact analysis for a pull request: the symbols its changed files declare; for each, the ' +
  'callers found in the repository\'s code index; and the HTTP endpoints and cron jobs within ' +
  'two levels of the reverse import graph of the changed files, labelled potentially affected, ' +
  'never asserted as reached. `status` (`indexed`, `partial`, `degraded`, `none`) says how much ' +
  'the map can be trusted; anything but `indexed` carries a `reason`, and an empty or degraded ' +
  'result means the analysis is incomplete, not that the change is safe. Accepts a PR uuid or ' +
  '`owner/repo#N`. Use it to judge the blast radius of a pull request before reviewing it.';

export function registerGetBlastRadius(server: McpServer): void {
  server.registerTool(
    'get_blast_radius',
    {
      title: "Blast radius of a pull request's changes",
      description: DESCRIPTION,
      inputSchema: z.object({
        pr: z
          .string()
          .describe(
            'The pull request: a DevDigest PR uuid, or the human form `owner/repo#N` (e.g. ' +
              '`acme/web#42`). Resolving the human form calls the API\'s pulls route, which ' +
              'syncs from GitHub and backfills up to 10 pull requests for that repo — pass a ' +
              'uuid if you already have one and want no side effect.',
          ),
      }),
      // `readOnlyHint` describes this tool's own request against
      // `GET /pulls/:id/blast` — a read that makes zero model calls (R8) and
      // writes nothing. It does not cover `resolvePr`'s upstream sync; that
      // effect is stated in the `pr` field's description above instead, the
      // same split `get_findings` uses for the same resolver
      // (`get-findings.ts:24-31,99`).
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ pr }) => {
      try {
        const prId = await resolvePr(pr);
        const body = await apiGet<unknown>(`/pulls/${prId}/blast`);

        // Parsed against the wire contract on the way out, so a server field
        // this schema has not been widened for fails loudly here instead of
        // silently dropping out of `structuredContent`.
        const structuredContent = BlastRadiusWire.parse(body);

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(structuredContent, null, 2) }],
          structuredContent,
        };
      } catch (err) {
        const text = err instanceof Error ? err.message : String(err);
        log.error(`get_blast_radius failed: ${text}`);
        return { isError: true, content: [{ type: 'text' as const, text }] };
      }
    },
  );
}
