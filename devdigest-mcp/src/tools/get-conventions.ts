/**
 * `get_conventions` — the coding conventions L02's extractor found in a repo.
 *
 * Two shaping decisions carry the weight here:
 *
 * **The default is no status filter.** L02's extractor may leave every
 * candidate `pending` until a human accepts it, so defaulting to `accepted`
 * would make a healthy scan look like an empty one — a silent wrong answer,
 * which is worse than a noisy right one. The caller narrows deliberately.
 *
 * **`concise` drops `evidence.snippet` and keeps `evidence.path` plus the line
 * range.** The snippet is the payload's size driver; the locator is what makes
 * a rule checkable. Dropping the locator to save bytes would leave a rule the
 * model cannot verify, which is the one thing worth spending bytes on.
 *
 * Everything filtered or truncated away is counted in the result, next to the
 * name of the parameter that widens it (R12). A result the model cannot widen
 * is what makes it tell the user the answer is incomplete and stop.
 */
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { apiGet } from '../api/client';
import { resolveRepo } from '../api/resolve';
import type { ConventionLite, ConventionScanLite } from '../api/types';
import { log } from '../log';

const MAX_RESULT_SIZE_CHARS = 100_000;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const DESCRIPTION =
  'Read the coding conventions extracted from a repository — the rules the codebase ' +
  'already follows, each with the file, line range and (in `full` detail) the code ' +
  'snippet it was inferred from. Accepts a repo uuid or `owner/repo`. Candidates start ' +
  'as `pending` until a human accepts or rejects them, so by default no status filter is ' +
  'applied. Use this before reviewing or writing code in a repo, to follow its ' +
  'conventions rather than generic ones.';

/** `concise` keeps the locator and drops the snippet; `full` keeps both. */
function project(row: ConventionLite, detail: 'concise' | 'full'): Record<string, unknown> {
  return {
    id: row.id,
    category: row.category,
    rule: row.rule,
    confidence: row.confidence,
    status: row.status,
    evidence: {
      path: row.evidence.path,
      line_start: row.evidence.line_start,
      line_end: row.evidence.line_end,
      ...(detail === 'full' ? { snippet: row.evidence.snippet } : {}),
    },
  };
}

export function registerGetConventions(server: McpServer): void {
  server.registerTool(
    'get_conventions',
    {
      title: 'Get a repository\'s extracted conventions',
      description: DESCRIPTION,
      // Flat and primitive — strings, an integer and two plain enums. No nested
      // objects and no exotic `format`: a schema the Anthropic API rejects
      // makes the tool disappear into `# Unavailable MCP Tools`, silently.
      inputSchema: z.object({
        repo: z
          .string()
          .min(1)
          .describe(
            'Repository: a repo uuid, or `owner/repo` (for example `acme/web`). The human ' +
              'form is resolved against the repos imported into this workspace.',
          ),
        status: z
          .enum(['pending', 'accepted', 'rejected'])
          .optional()
          .describe(
            'Keep only candidates with this status. Omit it — the default — to see all ' +
              'three; extraction leaves rows `pending` until a human triages them.',
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(MAX_LIMIT)
          .default(DEFAULT_LIMIT)
          .describe(`Maximum candidates to return. Default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}.`),
        detail: z
          .enum(['concise', 'full'])
          .default('concise')
          .describe(
            '`concise` (default) omits each evidence snippet but keeps its file path and ' +
              'line range; `full` adds the snippets back.',
          ),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      _meta: { 'anthropic/maxResultSizeChars': MAX_RESULT_SIZE_CHARS },
    },
    async ({ repo, status, limit, detail }) => {
      try {
        // A uuid short-circuits with zero HTTP calls; `owner/repo` costs one
        // `GET /repos`. Neither syncs from GitHub — only PR resolution does.
        const repoId = await resolveRepo(repo);
        const scan = await apiGet<ConventionScanLite>(`/repos/${repoId}/conventions`);

        const all = scan.candidates ?? [];
        const matched = status ? all.filter((c) => c.status === status) : all;
        const removedByStatus = all.length - matched.length;
        const window = matched.slice(0, limit);
        const truncated = matched.length - window.length;

        const notes: string[] = [];
        if (removedByStatus > 0) {
          notes.push(
            `${removedByStatus} candidate(s) were filtered out by \`status: '${status}'\` — ` +
              'omit `status` to see every candidate.',
          );
        }
        if (truncated > 0) {
          notes.push(
            `${truncated} more candidate(s) matched but were truncated by \`limit: ${limit}\` — ` +
              `raise \`limit\` (max ${MAX_LIMIT}) to see them.`,
          );
        }
        if (detail === 'concise') {
          notes.push(
            'Evidence snippets were omitted by `detail: "concise"` — the file path and ' +
              'line range are kept. Pass `detail: "full"` for the code itself.',
          );
        }
        if (all.length === 0) {
          notes.push(
            'This repo has no extracted conventions yet — run the extractor from the ' +
              'DevDigest UI before concluding the codebase has no conventions.',
          );
        }

        const payload = {
          repo_id: repoId,
          conventions: window.map((c) => project(c, detail)),
          total_candidates: all.length,
          total_matching_filter: matched.length,
          returned: window.length,
          filtered_out_by_status: removedByStatus,
          truncated_by_limit: truncated,
          detail,
          sampled_files: scan.sampled_files,
          dropped_unverified: scan.dropped_unverified,
          scanned_sha: scan.scanned_sha,
          scanned_at: scan.scanned_at,
          ...(notes.length > 0 ? { notes } : {}),
        };

        return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
      } catch (err) {
        // Both `ResolveError` ("no repo named X; imported repos are …") and
        // `ApiError` (status, code, next action) carry text written for the
        // model to act on — surfacing `message` is the whole handling (R10).
        const text = err instanceof Error ? err.message : String(err);
        log.error(`get_conventions failed: ${text}`);
        return { isError: true, content: [{ type: 'text' as const, text }] };
      }
    },
  );
}
