/**
 * `get_findings` — read a completed review back.
 *
 * Two things about the API shape this tool: `GET /pulls/:id/reviews` is the
 * only reviews route, so there is no server-side `run_id` filter and no
 * server-side paging — the whole payload for the PR crosses the wire and is
 * narrowed here. That is accepted (the plan's *Risks*), and it is exactly why
 * `severity`, `limit`, `offset` and `detail` all exist: the cost is one HTTP
 * response, and what must stay bounded is what reaches the model.
 *
 * The narrowing itself lives in `src/shape/findings.ts`, which is also what
 * `run_agent_on_pr` returns on completion, so a review read here and a review
 * returned there are the same object.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { apiGet } from '../api/client';
import { resolvePr } from '../api/resolve';
import { log } from '../log';
import type { ReviewLite, Severity } from '../api/types';
import { DEFAULT_LIMIT, MAX_LIMIT, shapeFindings } from '../shape/findings';

const inputSchema = z.object({
  pr: z
    .string()
    .describe(
      'The pull request: a DevDigest PR uuid, or the human form `owner/repo#N` (e.g. ' +
        '`acme/web#42`). Resolving the human form calls the API\'s pulls route, which syncs ' +
        'from GitHub and backfills up to 10 pull requests for that repo — pass a uuid if you ' +
        'already have one and want no side effect.',
    ),
  run_id: z
    .string()
    .optional()
    .describe(
      'Only findings from this run. Use a run id returned by `run_agent_on_pr`; omit it to ' +
        'read every review on the pull request.',
    ),
  severity: z
    .array(z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']))
    .optional()
    .describe(
      'Keep only these severities. Independent of `limit`/`offset`: this chooses which ' +
        'findings exist, those choose which window of them is returned.',
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .default(DEFAULT_LIMIT)
    .describe(`How many findings to return (max ${MAX_LIMIT}).`),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe(
      'Skip this many of the matching findings. The result states the total, so the next page ' +
        'is `offset + limit`.',
    ),
  detail: z
    .enum(['concise', 'full'])
    .default('concise')
    .describe(
      '`concise` omits `rationale` and `suggestion` (the two large markdown fields); `full` ' +
        'includes them. Start concise and re-read one finding in full.',
    ),
});

const description =
  'Read the findings, verdict and score of a DevDigest code review that has already run on a ' +
  'pull request. Filter by severity (CRITICAL, WARNING, SUGGESTION) and page with limit and ' +
  'offset; `detail: "concise"` omits the long rationale and suggestion text. Use this after ' +
  '`run_agent_on_pr`, and to pick up a review whose run timed out.';

type ToolText = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

function text(body: string, isError = false): ToolText {
  return isError
    ? { content: [{ type: 'text', text: body }], isError: true }
    : { content: [{ type: 'text', text: body }] };
}

/** `ApiError` and `ResolveError` both carry their own next action (R10, R9). */
function failure(err: unknown): ToolText {
  const body = err instanceof Error ? err.message : String(err);
  log.error(`get_findings failed: ${body}`);
  return text(body, true);
}

export function registerGetFindings(server: McpServer): void {
  server.registerTool(
    'get_findings',
    {
      title: 'Read a pull request review',
      description,
      inputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      _meta: { 'anthropic/maxResultSizeChars': 200000 },
    },
    async (args) => {
      const { pr, run_id, severity, detail } = args;
      const limit = args.limit ?? DEFAULT_LIMIT;
      const offset = args.offset ?? 0;

      try {
        const prId = await resolvePr(pr);
        const reviews = await apiGet<ReviewLite[]>(`/pulls/${prId}/reviews`);

        // Client-side by necessity: there is no run-scoped reviews route. A
        // review row whose `run_id` is null (the contract allows it) can never
        // match a requested run and is dropped rather than guessed at.
        const selected =
          run_id === undefined ? reviews : reviews.filter((r) => r.run_id === run_id);

        if (selected.length === 0) {
          return text(
            run_id === undefined
              ? `No review has been run on this pull request yet. Start one with ` +
                  '`run_agent_on_pr` (pass `agent_id` from `list_agents`, or `all_agents: true`).'
              : `No review on this pull request came from run \`${run_id}\`. Runs with a review: ` +
                  `${reviews.map((r) => r.run_id ?? '(none)').join(', ') || 'none'}. Omit ` +
                  '`run_id` to read every review on the pull request.',
            true,
          );
        }

        const findings = selected.flatMap((r) => r.findings ?? []);
        const shaped = shapeFindings(findings, {
          ...(severity === undefined ? {} : { severity: severity as Severity[] }),
          limit,
          offset,
          detail,
        });

        return text(
          JSON.stringify(
            {
              pr,
              pr_id: prId,
              ...(run_id === undefined ? {} : { run_id }),
              reviews: selected.map((r) => ({
                id: r.id,
                run_id: r.run_id,
                agent_name: r.agent_name ?? null,
                verdict: r.verdict,
                score: r.score,
                summary: r.summary,
                model: r.model,
                created_at: r.created_at,
              })),
              ...shaped,
            },
            null,
            2,
          ),
        );
      } catch (err) {
        return failure(err);
      }
    },
  );
}
