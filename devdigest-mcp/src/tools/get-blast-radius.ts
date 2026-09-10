/**
 * `get_blast_radius` — an **honest stub** (R8).
 *
 * There is no `GET /pulls/:id/blast` route on the DevDigest API and no
 * blast-radius analysis behind it; `container.repoIntel.*` is server-side code
 * this package must never reach. The real tool is a later lesson: a route plus
 * a mapper from the camelCase facade `BlastResult`
 * (`server/src/modules/repo-intel/service.ts:220`) to the snake_case wire
 * contract this file already answers in. The stub exists so that work is a
 * mapper and a route rather than a contract change.
 *
 * **The failure mode this file is written against is wording, not code.** A
 * tool that returns empty arrays reads to a model as *"analysed, found no
 * impact"* — a strictly false and actively harmful conclusion, because it is
 * indistinguishable from a real all-clear. So the `summary` says *not
 * implemented*, names the files it was asked about (proof it received them and
 * did nothing with them), and hands the caller a fallback it can actually
 * perform. The tool description says the same at its end. Neither ever says
 * "no impact".
 *
 * Errors are not caught here: `McpServer` turns a thrown `Error` into
 * `{ isError: true, content: [{ text: error.message }] }`, and both
 * `ResolveError.message` and `ApiError.message` are already written to be read
 * by the model. Catching them would only re-wrap text that is already right.
 */
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { resolveRepo } from '../api/resolve';
import { BlastRadiusWire } from '../types/blast';

/**
 * Tool-search corpus. A model never searches for the string
 * `get_blast_radius` — it searches for what it wants to know, so the words
 * *impact*, *callers*, *downstream*, *affected files* and *symbols* lead. The
 * last sentence is what stops the model believing an empty result.
 */
const DESCRIPTION =
  'Impact analysis for a code change: which callers, downstream symbols, HTTP endpoints and ' +
  'cron jobs are affected by editing a given set of files in a repository, and which symbols ' +
  'those files change. Use it to judge the blast radius of a pull request before reviewing it. ' +
  'Accepts a repo uuid or `owner/repo`. Not yet implemented; returns an empty impact set — ' +
  'that empty set means no analysis was run, not that the change is safe.';

/** Enough files to prove the tool read the argument, not so many that a
 *  200-file call turns one stub answer into a wall of text. */
function nameFiles(files: readonly string[]): string {
  if (files.length === 0) return 'none were listed';
  const shown = files.slice(0, 20).join(', ');
  return files.length > 20 ? `${shown}, … (${files.length} total)` : shown;
}

/**
 * The `summary` an empty payload is carried by. Every clause is load-bearing:
 * what did not happen, what the empty arrays do *not* mean, which files were
 * asked about, and what to do instead.
 */
export function stubSummary(files: readonly string[]): string {
  return (
    'Blast-radius analysis is not implemented in DevDigest yet, so nothing was analysed. ' +
    'The empty `changed_symbols` and `downstream` arrays below are a placeholder, NOT a ' +
    `finding — do not read them as an all-clear. Files this call asked about: ${nameFiles(files)}. ` +
    'To judge the impact of these files, read the pull request diff directly and search the ' +
    'repository for callers of the symbols it changes.'
  );
}

/**
 * Registers the stub. `src/server.ts` (the composition root) calls this; no
 * tool file imports another tool file.
 */
export function registerGetBlastRadius(server: McpServer): void {
  server.registerTool(
    'get_blast_radius',
    {
      title: 'Blast radius of a change (stub)',
      description: DESCRIPTION,
      inputSchema: z.object({
        repo: z
          .string()
          .describe(
            'Repository: a repo uuid, or `owner/repo` (for example `acme/web`), matched ' +
              'case-insensitively against the repos imported into DevDigest.',
          ),
        files: z
          .array(z.string())
          .describe('Repository-relative paths of the changed files, e.g. `src/api/client.ts`.'),
      }),
      // Reads only; two calls with the same arguments give the same answer.
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ repo, files }) => {
      // Resolved even though nothing downstream uses the id: a wrong repo ref
      // must fail with `ResolveError`'s "here is what does exist" message
      // rather than being silently answered by a stub. It also keeps the
      // failure shape identical to the implemented tool's, so the later lesson
      // changes what the tool computes and not how it rejects.
      await resolveRepo(repo);

      const payload: BlastRadiusWire = {
        changed_symbols: [],
        downstream: [],
        summary: stubSummary(files),
      };

      // Parsed against the contract on the way out, so the stub can never drift
      // from the shape the later lesson's mapper has to produce.
      const structuredContent = BlastRadiusWire.parse(payload);

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(structuredContent, null, 2) }],
        structuredContent,
      };
    },
  );
}
