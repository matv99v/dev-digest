import { z } from 'zod';

/**
 * Agent stats contracts. `Agent` / `Provider` / `ReviewStrategy` already live in
 * `contracts/knowledge.ts` — this file adds only the aggregated view built on
 * top of `agent_runs` + `reviews` + `findings`: the per-card summary used by
 * the Agents grid, and the full Stats tab breakdown.
 *
 * `accept_rate` / `avg_cost_usd` / `avg_duration_ms` are all nullable — null
 * means no signal yet (an agent that has never run, or has no accept/dismiss
 * decisions), and the UI renders '—', never '0%' / '$0.00'. Same contract as
 * `SkillStats.accept_rate`.
 */

export const AgentStatsSummary = z.object({
  agent_id: z.string(),
  runs_30d: z.number().int(),
  accept_rate: z.number().min(0).max(1).nullable(),
  avg_cost_usd: z.number().nullable(),
});
export type AgentStatsSummary = z.infer<typeof AgentStatsSummary>;

export const AgentRunHistoryRow = z.object({
  run_id: z.string(),
  ran_at: z.string().nullable(),
  repo_id: z.string().nullable(),
  pr_number: z.number().int().nullable(),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  findings_count: z.number().int().nullable(),
  source: z.enum(['local', 'ci']),
  status: z.string().nullable(),
});
export type AgentRunHistoryRow = z.infer<typeof AgentRunHistoryRow>;

export const AgentStatsDetail = AgentStatsSummary.extend({
  /** Run count per day over the last 30 days, oldest first — feeds the
      Total-runs MetricCard's sparkline. */
  runs_trend: z.array(z.number().int()),
  /** Avg cost/run this 30d window minus the prior 30d window; null when the
      prior window has no priced runs to compare against. */
  avg_cost_delta: z.number().nullable(),
  avg_duration_ms: z.number().nullable(),
  findings_last_30d: z.number().int(),
  findings_by_category: z.record(z.string(), z.number().int()),
  /** Findings by severity, bucketed into rolling 7-day windows (oldest
      first) over the last 30 days — feeds the severity bar chart. */
  findings_by_severity_weekly: z.array(
    z.object({
      week: z.string(),
      critical: z.number().int(),
      warning: z.number().int(),
      suggestion: z.number().int(),
    }),
  ),
  /** Most recent runs, newest first, capped for the Run history table. */
  runs: z.array(AgentRunHistoryRow),
});
export type AgentStatsDetail = z.infer<typeof AgentStatsDetail>;
