/**
 * `list_agents` — the review agents configured in this DevDigest workspace.
 *
 * The cheapest of the five tools and the entry point to the other four: no tool
 * here returns an agent id except this one, so `run_agent_on_pr` is unreachable
 * without it.
 *
 * **R3 — `system_prompt` never leaves this file, on any path.** It is enforced
 * twice, deliberately:
 *
 *  1. *Compile time* — `AgentSummary` (`src/api/types.ts`) simply has no
 *     `system_prompt` field, so nothing here can name one.
 *  2. *Run time* — the projection below is written field by field rather than
 *     as a spread. `{ ...row }` would typecheck perfectly and still carry the
 *     prompt (and `output_schema`) across the wire, because the values arrive
 *     from `fetch` and TypeScript has no say over what a response body holds.
 *     That gap is exactly what the sentinel test asserts against.
 *
 * The description is the tool-search corpus — it is what a query is matched
 * against, so *agent*, *reviewer*, *configured*, *id*, *model* and *provider*
 * all appear in it on purpose.
 */
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { apiGet } from '../api/client';
import type { AgentSummary } from '../api/types';
import { log } from '../log';

/** R12 — a truncation message has to point at something real, so the cap is
 *  declared and the tool offers a filter that widens what fits under it. */
const MAX_RESULT_SIZE_CHARS = 100_000;

const DESCRIPTION =
  'List the review agents configured in this DevDigest workspace. Returns each ' +
  "reviewer's id, name, description, provider, model, enabled flag, review strategy and " +
  'CI fail threshold. The `id` is what `run_agent_on_pr` takes — no other tool returns ' +
  "one, so start here. An agent's system prompt is never returned. Pass " +
  '`enabled_only: true` to hide reviewers that are configured but switched off.';

/**
 * Field-by-field, never a spread. See the file header — this is the runtime
 * half of R3 and the only thing standing between a 4 KB system prompt (or an
 * `output_schema` blob) and the model's context window.
 */
function project(row: AgentSummary): AgentSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    provider: row.provider,
    model: row.model,
    enabled: row.enabled,
    strategy: row.strategy,
    ci_fail_on: row.ci_fail_on,
  };
}

export function registerListAgents(server: McpServer): void {
  server.registerTool(
    'list_agents',
    {
      title: 'List DevDigest review agents',
      description: DESCRIPTION,
      // Flat and primitive on purpose: a schema the Anthropic API rejects makes
      // the whole tool vanish into `# Unavailable MCP Tools` with no error.
      inputSchema: z.object({
        enabled_only: z
          .boolean()
          .default(false)
          .describe('Return only agents with `enabled: true`. Default false — everything.'),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      _meta: { 'anthropic/maxResultSizeChars': MAX_RESULT_SIZE_CHARS },
    },
    async ({ enabled_only }) => {
      try {
        const rows = await apiGet<AgentSummary[]>('/agents');
        const kept = enabled_only ? rows.filter((r) => r.enabled) : rows;
        const hiddenByFilter = rows.length - kept.length;

        const payload = {
          agents: kept.map(project),
          total_configured: rows.length,
          returned: kept.length,
          // R12 — say what was dropped and name the parameter that brings it
          // back. A count the caller cannot widen is worse than no count.
          hidden_by_enabled_only: hiddenByFilter,
          ...(hiddenByFilter > 0
            ? {
                note:
                  `${hiddenByFilter} disabled agent(s) were hidden. Call again with ` +
                  '`enabled_only: false` to see them.',
              }
            : {}),
        };

        return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
      } catch (err) {
        // `ApiError.message` and `ResolveError.message` are both written to be
        // read by the model: they name the failure AND the next action (R10).
        const text = err instanceof Error ? err.message : String(err);
        log.error(`list_agents failed: ${text}`);
        return { isError: true, content: [{ type: 'text' as const, text }] };
      }
    },
  );
}
