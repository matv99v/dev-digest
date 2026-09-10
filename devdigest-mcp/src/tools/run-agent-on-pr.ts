/**
 * `run_agent_on_pr` — the only tool in this server that writes anything, and
 * the only one that waits.
 *
 * The API's review route returns before the review exists
 * (`server/src/modules/reviews/service.ts:137`), so "run a review" over MCP is
 * three steps, not one: POST once, poll `GET /pulls/:id/runs` until every run
 * this call started is terminal (`poll.ts`), then read the reviews back. The
 * POST happens **exactly once** no matter how long the wait runs — the route is
 * capped at 10/min and a second POST would start a second review rather than
 * check on the first.
 *
 * The handler never throws for a slow review: on cut-off it returns the
 * `run_ids` and tells the caller to come back with `get_findings`. The work is
 * still happening on the server, and those ids are the only way back to it.
 */
import { z } from 'zod';
import type { McpServer, ServerContext } from '@modelcontextprotocol/server';
import { apiGet, apiPost } from '../api/client';
import { nextActionFor } from '../api/errors';
import { resolvePr } from '../api/resolve';
import { log } from '../log';
import type { ReviewLite, ReviewRunStartedLite } from '../api/types';
import { DEFAULT_LIMIT, shapeFindings } from '../shape/findings';
import { pollUntilTerminal, type ProgressNotifier } from './poll';

/** Kept as a constant rather than only in the schema's `.default()` so the
 *  handler has the same number when it is called directly (a test, or a client
 *  that omits the field). */
export const DEFAULT_TIMEOUT_S = 600;
/** 30 minutes. Above this the client's own stdio idle window is the binding
 *  constraint, not ours. Raising `timeout_s` past the root `.mcp.json`'s
 *  `MCP_TOOL_TIMEOUT` (660 000 ms) hands the race back to the client — README
 *  says so at the parameter. */
export const MAX_TIMEOUT_S = 1800;

const inputSchema = z.object({
  pr: z
    .string()
    .describe(
      'The pull request: a DevDigest PR uuid, or the human form `owner/repo#N` (e.g. ' +
        '`acme/web#42`). Resolving the human form calls the API\'s pulls route, which syncs ' +
        'from GitHub and backfills up to 10 pull requests for that repo — pass a uuid if you ' +
        'already have one and want no side effect.',
    ),
  agent_id: z
    .string()
    .optional()
    .describe('Run this one reviewer agent. Get a valid id from `list_agents`.'),
  all_agents: z
    .boolean()
    .optional()
    .describe('Run every enabled reviewer agent on the pull request. Use instead of `agent_id`.'),
  timeout_s: z
    .number()
    .int()
    .min(10)
    .max(MAX_TIMEOUT_S)
    .default(DEFAULT_TIMEOUT_S)
    .describe(
      'How long to wait for the review before returning the run ids instead of the findings. ' +
        'The review keeps running on the server either way; on timeout, call `get_findings` ' +
        'later. Raising this above 600 also requires raising MCP_TOOL_TIMEOUT in .mcp.json.',
    ),
});

const description =
  'Start a DevDigest code review on a pull request with a reviewer agent and WAIT for it to ' +
  'finish, returning the verdict, score and findings. Reviews take minutes: this tool polls ' +
  'and reports progress rather than returning immediately. It starts the review exactly once ' +
  'and never restarts it, so never call it twice for the same pull request — if it times out, ' +
  'call `get_findings` with the run ids it returns. Requires either `agent_id` (from ' +
  '`list_agents`) or `all_agents: true`.';

type ToolText = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

function text(body: string, isError = false): ToolText {
  return isError
    ? { content: [{ type: 'text', text: body }], isError: true }
    : { content: [{ type: 'text', text: body }] };
}

/** `ApiError` and `ResolveError` both build their own actionable message
 *  (R10, R9), so surfacing `message` is the whole of the error path. */
function failure(err: unknown): ToolText {
  const body = err instanceof Error ? err.message : String(err);
  log.error(`run_agent_on_pr failed: ${body}`);
  return text(body, true);
}

/**
 * Build the real progress sink from a tool call's context.
 *
 * A client that did not send a `progressToken` does not want progress
 * notifications, and sending them anyway is a protocol violation — so the
 * no-token case is a no-op rather than a best effort. A notification that fails
 * to send is logged and swallowed: losing progress must never lose the review.
 */
export function progressNotifierFrom(ctx: ServerContext): ProgressNotifier {
  const token = ctx.mcpReq._meta?.progressToken;
  if (token === undefined) {
    log.info('no progressToken on this call — waiting silently');
    return () => {};
  }
  return async ({ progress, total, message }) => {
    try {
      await ctx.mcpReq.notify({
        method: 'notifications/progress',
        params: { progressToken: token, progress, total, message },
      });
    } catch (err) {
      log.warn(`progress notification failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
}

export function registerRunAgentOnPr(server: McpServer): void {
  server.registerTool(
    'run_agent_on_pr',
    {
      title: 'Run a DevDigest review on a pull request',
      description,
      inputSchema,
      annotations: {
        readOnlyHint: false,
        // It creates runs and reviews; it destroys nothing and cancels nothing.
        destructiveHint: false,
        // Calling it again starts another review, and costs another LLM call.
        idempotentHint: false,
        openWorldHint: true,
      },
      _meta: { 'anthropic/maxResultSizeChars': 200000 },
    },
    async (args, ctx) => {
      const { pr, agent_id, all_agents } = args;
      const timeoutS = args.timeout_s ?? DEFAULT_TIMEOUT_S;

      // R10, and the reason this check is first: resolving `pr` would already
      // call the API (and possibly sync from GitHub) for a request that can
      // never succeed. A missing target costs zero HTTP calls.
      if (agent_id === undefined && all_agents !== true) {
        return text(
          'run_agent_on_pr needs a target and was given neither: ' +
            nextActionFor(400, 'invalid_run_request'),
          true,
        );
      }

      try {
        const prId = await resolvePr(pr);

        // Exactly one POST, ever. See the file header.
        const started = await apiPost<ReviewRunStartedLite>(
          `/pulls/${prId}/review`,
          all_agents === true ? { all: true } : { agentId: agent_id },
        );
        const runIds = (started.runs ?? []).map((r) => r.run_id);

        if (runIds.length === 0) {
          return text(
            'The API accepted the request but started no runs. That usually means no reviewer ' +
              'agent matched: call `list_agents` and pass one of its ids as `agent_id`, or check ' +
              'that at least one agent is enabled before using `all_agents: true`.',
            true,
          );
        }
        log.info(`started ${runIds.length} run(s) on ${prId}: ${runIds.join(', ')}`);

        const outcome = await pollUntilTerminal({
          prId,
          runIds,
          timeoutMs: timeoutS * 1000,
          notify: progressNotifierFrom(ctx),
        });

        // Not an error: the review is running and recoverable. Returning
        // `isError` here would push the model to retry the POST, which is the
        // one thing that must not happen.
        if (outcome.stopped_reason !== 'terminal') {
          return text(
            JSON.stringify(
              {
                pr,
                pr_id: prId,
                status: outcome.stopped_reason,
                run_ids: outcome.run_ids,
                polls: outcome.polls,
                waited_s: Math.round(outcome.elapsed_ms / 1000),
                next: outcome.text,
              },
              null,
              2,
            ),
          );
        }

        // Terminal. Only this call's runs are read back — a PR normally carries
        // reviews from earlier runs, and returning those as if this call had
        // produced them would be a lie about what just happened.
        const reviews = await apiGet<ReviewLite[]>(`/pulls/${prId}/reviews`);
        const mine = reviews.filter((r) => r.run_id !== null && runIds.includes(r.run_id));
        const findings = mine.flatMap((r) => r.findings ?? []);

        return text(
          JSON.stringify(
            {
              pr,
              pr_id: prId,
              status: 'complete',
              run_ids: outcome.run_ids,
              waited_s: Math.round(outcome.elapsed_ms / 1000),
              runs: outcome.text,
              reviews: mine.map((r) => ({
                id: r.id,
                run_id: r.run_id,
                agent_name: r.agent_name ?? null,
                verdict: r.verdict,
                score: r.score,
                summary: r.summary,
                model: r.model,
                created_at: r.created_at,
              })),
              // The same concise projection `get_findings` returns, so a later
              // `get_findings` on this PR reads identically.
              ...shapeFindings(findings, { detail: 'concise', limit: DEFAULT_LIMIT, offset: 0 }),
              next:
                'For the omitted fields or the next page, call `get_findings` with this `pr` ' +
                'and a `run_id` from `run_ids`.',
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
