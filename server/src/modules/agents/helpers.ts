import type {
  Agent,
  AgentRunHistoryRow,
  AgentVersion,
  CiFailOn,
  Provider,
  ReviewStrategy,
} from '@devdigest/shared';
import { AgentVersionConfig } from '@devdigest/shared';
import type { AgentRow, AgentVersionRow } from './repository.js';

/**
 * Pure helpers for the agents module — DB row ⇄ DTO mapping and the
 * config-version-bump rule. No I/O; behaviour-identical to the previous inline
 * implementations.
 */

/** Map a persisted agent row to the public `Agent` DTO. */
export function toAgentDto(row: AgentRow): Agent {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    provider: row.provider as Provider,
    model: row.model,
    system_prompt: row.systemPrompt,
    output_schema: row.outputSchema ?? null,
    enabled: row.enabled,
    version: row.version,
    strategy: row.strategy as ReviewStrategy,
    ci_fail_on: row.ciFailOn as CiFailOn,
    repo_intel: row.repoIntel,
  };
}

/**
 * Map a persisted `agent_versions` row to the public `AgentVersion` DTO. The
 * stored `config_json` is untyped jsonb (a snapshot from an older config shape
 * could drift), so it is parsed through `AgentVersionConfig` — a malformed
 * snapshot throws here rather than leaking an unvalidated blob to the client.
 */
export function toAgentVersionDto(row: AgentVersionRow): AgentVersion {
  return {
    agent_id: row.agentId,
    version: row.version,
    config: AgentVersionConfig.parse(row.configJson),
    created_at: row.createdAt.toISOString(),
  };
}

/** Fields whose change bumps the agent's config version (anything but `enabled`). */
export interface ConfigChangePatch {
  name?: string;
  description?: string;
  provider?: Provider;
  model?: string;
  systemPrompt?: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
}

/**
 * True when a patch changes config (vs. just toggling `enabled`) relative to the
 * existing row — a config change bumps the version and snapshots agent_versions.
 */
export function isConfigChange(
  existing: Pick<
    AgentRow,
    | 'name'
    | 'description'
    | 'provider'
    | 'model'
    | 'systemPrompt'
    | 'strategy'
    | 'ciFailOn'
    | 'repoIntel'
  >,
  patch: ConfigChangePatch,
): boolean {
  return (
    (patch.name !== undefined && patch.name !== existing.name) ||
    (patch.description !== undefined && patch.description !== existing.description) ||
    (patch.provider !== undefined && patch.provider !== existing.provider) ||
    (patch.model !== undefined && patch.model !== existing.model) ||
    (patch.systemPrompt !== undefined && patch.systemPrompt !== existing.systemPrompt) ||
    (patch.strategy !== undefined && patch.strategy !== existing.strategy) ||
    (patch.ciFailOn !== undefined && patch.ciFailOn !== existing.ciFailOn) ||
    (patch.repoIntel !== undefined && patch.repoIntel !== existing.repoIntel) ||
    patch.outputSchema !== undefined
  );
}

// ============================================================ Stats — pure bucketing/aggregation

/**
 * Mean of the non-null values, or null when every value is null/undefined —
 * an unpriced run or a run with no duration recorded must not silently drag
 * the average toward zero.
 */
export function averageOf(values: readonly (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** `current avg − prior avg`; null when either window has no priced data to compare. */
export function costDelta(
  current: readonly (number | null | undefined)[],
  prior: readonly (number | null | undefined)[],
): number | null {
  const cur = averageOf(current);
  const before = averageOf(prior);
  if (cur == null || before == null) return null;
  return cur - before;
}

/**
 * Fraction of findings with a decision (accept or dismiss) that were
 * accepted, in [0, 1]. Null when nothing has been decided yet — never 0.
 */
export function computeAcceptRate(
  rows: readonly { acceptedAt: Date | null; dismissedAt: Date | null }[],
): number | null {
  let decided = 0;
  let accepted = 0;
  for (const r of rows) {
    if (r.acceptedAt) {
      decided += 1;
      accepted += 1;
    } else if (r.dismissedAt) {
      decided += 1;
    }
  }
  return decided > 0 ? accepted / decided : null;
}

export function findingsByCategory(rows: readonly { category: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.category] = (out[r.category] ?? 0) + 1;
  return out;
}

/** Start of `d`'s UTC calendar day, as epoch ms — the unit `bucketRunsByDay`
 *  and `bucketFindingsBySeverityWeek` both bucket against. */
function utcDayStart(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Run count per UTC calendar day over the last `days` days, oldest first —
 * feeds the Total-runs MetricCard's sparkline. `now` is injectable for tests.
 */
export function bucketRunsByDay(
  rows: readonly { ranAt: Date | null }[],
  days: number,
  now: Date = new Date(),
): number[] {
  const buckets = new Array<number>(days).fill(0);
  const todayStart = utcDayStart(now);
  for (const r of rows) {
    if (!r.ranAt) continue;
    const diffDays = Math.round((todayStart - utcDayStart(r.ranAt)) / DAY_MS);
    const idx = days - 1 - diffDays;
    if (idx >= 0 && idx < days) buckets[idx]! += 1;
  }
  return buckets;
}

export interface SeverityWeekBucket {
  week: string;
  critical: number;
  warning: number;
  suggestion: number;
}

/**
 * Findings by severity, bucketed into `weeks` rolling 7-day windows ending
 * today (oldest first). `week` is the bucket's UTC start date (`YYYY-MM-DD`)
 * — a rolling window, not a calendar ISO week (no need for that precision
 * here, and it sidesteps the ISO-week edge cases around year boundaries).
 */
export function bucketFindingsBySeverityWeek(
  rows: readonly { severity: string; reviewCreatedAt: Date | null }[],
  weeks: number,
  now: Date = new Date(),
): SeverityWeekBucket[] {
  const todayStart = utcDayStart(now);
  const buckets: SeverityWeekBucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const bucketStart = todayStart - i * 7 * DAY_MS;
    buckets.push({
      week: new Date(bucketStart).toISOString().slice(0, 10),
      critical: 0,
      warning: 0,
      suggestion: 0,
    });
  }
  for (const r of rows) {
    if (!r.reviewCreatedAt) continue;
    const diffDays = Math.round((todayStart - utcDayStart(r.reviewCreatedAt)) / DAY_MS);
    const idx = weeks - 1 - Math.floor(diffDays / 7);
    if (idx < 0 || idx >= weeks) continue;
    const bucket = buckets[idx]!;
    if (r.severity === 'CRITICAL') bucket.critical += 1;
    else if (r.severity === 'WARNING') bucket.warning += 1;
    else if (r.severity === 'SUGGESTION') bucket.suggestion += 1;
  }
  return buckets;
}

/** Map a run-history row (agent_runs ⨝ pull_requests) to the public DTO. */
export function toAgentRunHistoryDto(row: {
  runId: string;
  ranAt: Date | null;
  repoId: string | null;
  prNumber: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  durationMs: number | null;
  findingsCount: number | null;
  source: string | null;
  status: string | null;
}): AgentRunHistoryRow {
  return {
    run_id: row.runId,
    ran_at: row.ranAt ? row.ranAt.toISOString() : null,
    repo_id: row.repoId,
    pr_number: row.prNumber,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    cost_usd: row.costUsd,
    duration_ms: row.durationMs,
    findings_count: row.findingsCount,
    source: row.source === 'ci' ? 'ci' : 'local',
    status: row.status,
  };
}
