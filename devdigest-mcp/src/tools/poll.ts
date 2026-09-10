/**
 * Waiting for a review to finish (R4, R5).
 *
 * `POST /pulls/:id/review` is **fire-and-forget**: it creates the `agent_runs`
 * rows, returns `{pr_id, runs, reviews: []}` immediately and executes the review
 * in the background (`server/src/modules/reviews/service.ts:137`). The doc
 * comment above `ReviewRunResponse` (`contracts/review-api.ts:40-44`) still
 * calls the run "synchronous"; it is wrong, and this file is the consequence.
 *
 * So the waiting is ours. Three properties of the API shape it:
 *
 *  1. **Never re-POST.** The review route is capped at 10/min
 *     (`server/src/modules/reviews/routes.ts:29`) and a second POST starts a
 *     *second* review rather than checking on the first. We poll
 *     `GET /pulls/:id/runs` instead, which is under the global 120/min cap and
 *     covers every run of an `all_agents: true` fan-out in one request.
 *  2. **A progress notification buys idle time, not wall-clock time.** It resets
 *     the client's 30-minute stdio idle window; it explicitly does **not**
 *     extend the client's hard deadline. That is why `timeoutMs` exists and why
 *     the root `.mcp.json` pins `MCP_TOOL_TIMEOUT` above it — the tool has to
 *     reach its own cut-off first, so it can return the `run_ids` instead of
 *     being killed with them.
 *  3. **A timeout is a result, not an error.** This function never throws for
 *     running out of time, and neither may its caller: the review is still
 *     going on the server, and the `run_ids` are the only way back to it.
 */
import { apiGet } from '../api/client';
import { log } from '../log';
import type { RunSummaryLite } from '../api/types';

/**
 * The statuses `agent_runs.status` settles on
 * (`contracts/trace.ts:109` — `running | done | failed | cancelled`). Anything
 * else, including a status this package has never heard of, counts as still
 * running: waiting one more round is recoverable, calling an unknown status
 * terminal is not.
 */
export const TERMINAL_STATUSES: readonly string[] = ['done', 'failed', 'cancelled'];

/** Poll every 3 s while a run is young… */
export const FIRST_INTERVAL_MS = 3_000;
/** …then every 10 s, because a review that has already taken a minute is an LLM
 *  call and not a fast one. Keeps a 30-minute wait to ~180 requests rather than
 *  600, well under the API's 120/min global cap either way. */
export const BACKOFF_INTERVAL_MS = 10_000;
/** When the backoff kicks in. */
export const BACKOFF_AFTER_MS = 60_000;

/**
 * How many consecutive `GET /pulls/:id/runs` failures end the wait. A single
 * blip (the API restarting under `tsx watch`, most likely) must not cost the
 * caller a review that is still running, but an API that has been unreachable
 * for three rounds is not going to answer this call either — and stopping with
 * the `run_ids` in hand beats holding the tool open until the client kills it.
 */
export const MAX_CONSECUTIVE_POLL_FAILURES = 3;

export interface ProgressUpdate {
  /** Runs that have reached a terminal status. */
  progress: number;
  /** Runs started. */
  total: number;
  message: string;
}

/**
 * Where a progress notification goes. **Injected**, so the poll loop is
 * testable with no transport, no client and no MCP session — the tool builds a
 * real one from its `ctx`, a test passes `vi.fn()`.
 */
export type ProgressNotifier = (update: ProgressUpdate) => void | Promise<void>;

export interface PollInput {
  /** PR uuid — already resolved; this file never resolves a human ref. */
  prId: string;
  /** The `run_id`s the POST reported. Rows for any *other* run on the PR are
   *  ignored: a PR usually carries older runs, and waiting for those would wait
   *  for work this call did not start. */
  runIds: string[];
  timeoutMs: number;
  notify?: ProgressNotifier;
}

/** Why the wait ended. `terminal` is the only one where reviews exist to read. */
export type PollStop = 'terminal' | 'timeout' | 'api_error';

export interface PollResult {
  /** Always the ids that were started, whatever happened — the caller's way
   *  back to the review via `get_findings`. */
  run_ids: string[];
  /** Last seen row per started run, in `run_ids` order. A run with no row yet
   *  is absent rather than faked. */
  runs: RunSummaryLite[];
  stopped_reason: PollStop;
  polls: number;
  elapsed_ms: number;
  /** The tool-visible report. Built here rather than in the tool so that the
   *  reaper wording (R5) has exactly one source. */
  text: string;
}

export function isTerminal(status: string | null | undefined): boolean {
  return status !== null && status !== undefined && TERMINAL_STATUSES.includes(status);
}

/**
 * R5 — the stale-run reaper's fingerprint.
 *
 * On boot the API calls `reapStaleRunningRuns`
 * (`server/src/modules/reviews/repository/run.repo.ts:137-143`), which sets
 * every `running` row to `failed` with a bare `.set({ status: 'failed' })` — no
 * `error`, no `duration_ms`. A genuine failure always writes both
 * (`run-executor.ts`'s catch), so the *combination* of three nulls is
 * unambiguous.
 *
 * This matters far more than it looks: `pnpm dev` is `tsx watch` over the whole
 * imported graph, so saving any file under `server/src/` or `reviewer-core/src/`
 * restarts the API and reaps whatever was in flight. Reported as a review
 * failure, every save during a review looks like a broken reviewer.
 */
export function isReapedRun(run: RunSummaryLite): boolean {
  return run.status === 'failed' && run.error === null && run.duration_ms === null;
}

/** The wording R5 requires, in one place so both the poll report and any later
 *  reader agree on it. */
export const REAPER_EXPLANATION =
  'the API restarted mid-run (stale-run reaper) — this is not a review failure; re-run it';

export function pollIntervalMs(elapsedMs: number): number {
  return elapsedMs < BACKOFF_AFTER_MS ? FIRST_INTERVAL_MS : BACKOFF_INTERVAL_MS;
}

function label(run: RunSummaryLite): string {
  const who = run.agent_name ?? run.agent_id ?? 'unknown agent';
  return `${who} (run ${run.run_id})`;
}

function seconds(ms: number): string {
  return `${Math.round(ms / 1000)}s`;
}

/**
 * One line per run. The three failure shapes read differently on purpose:
 * a real `error` is a review problem, three nulls are an infrastructure
 * problem, and `running` at cut-off is not a problem at all.
 */
export function describeRun(run: RunSummaryLite): string {
  const head = `- ${label(run)}: ${run.status ?? 'unknown status'}`;

  if (run.status === 'failed') {
    if (isReapedRun(run)) return `${head} — ${REAPER_EXPLANATION}.`;
    return `${head} — ${run.error ?? 'no error text was recorded'}.`;
  }

  if (run.status === 'done') {
    const parts = [
      run.score === null ? null : `score ${run.score}/100`,
      run.findings_count === null ? null : `${run.findings_count} finding(s)`,
      run.blockers === null ? null : `${run.blockers} blocker(s)`,
      run.duration_ms === null ? null : seconds(run.duration_ms),
    ].filter((p): p is string => p !== null);
    return parts.length === 0 ? `${head}.` : `${head} — ${parts.join(', ')}.`;
  }

  return `${head}.`;
}

function report(
  input: PollInput,
  runs: RunSummaryLite[],
  stop: PollStop,
  elapsedMs: number,
  lastError: string | null,
): string {
  const seen = new Set(runs.map((r) => r.run_id));
  const lines = [
    ...runs.map(describeRun),
    ...input.runIds
      .filter((id) => !seen.has(id))
      .map((id) => `- run ${id}: the API has not returned a row for this run yet.`),
  ];

  // Only the non-terminal endings need to point at `get_findings`: on a terminal
  // stop the caller has already fetched the reviews and is returning them.
  const later =
    `The review is still running on the server — it was NOT cancelled, and it must NOT be ` +
    `started again (the review route is capped at 10/min). Call \`get_findings\` with the same ` +
    `\`pr\` argument in a few minutes to read the verdict and findings; pass one of the ` +
    `\`run_ids\` above as \`run_id\` to narrow to a single agent.`;

  if (stop === 'timeout') {
    return [
      `Timed out waiting after ${seconds(elapsedMs)} for ${input.runIds.length} run(s). ` +
        'Last seen status of each:',
      ...lines,
      '',
      later,
    ].join('\n');
  }

  if (stop === 'api_error') {
    return [
      `Stopped waiting after ${seconds(elapsedMs)}: the DevDigest API stopped answering ` +
        `\`GET /pulls/${input.prId}/runs\` (${lastError ?? 'unknown error'}).`,
      'Last seen status of each run:',
      ...lines,
      '',
      later,
    ].join('\n');
  }

  return [`All ${input.runIds.length} run(s) finished after ${seconds(elapsedMs)}:`, ...lines].join(
    '\n',
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Poll `GET /pulls/:id/runs` until every started run is terminal, `timeoutMs`
 * elapses, or the API stops answering. **Never throws** — every ending is a
 * `PollResult` carrying the `run_ids`.
 *
 * One progress notification is emitted per *waiting* round: the round that
 * finds everything terminal returns instead of waiting, so a run that completes
 * on the third poll produces two notifications, not three.
 */
export async function pollUntilTerminal(input: PollInput): Promise<PollResult> {
  const { prId, runIds, timeoutMs, notify } = input;
  const startedAt = Date.now();

  if (runIds.length === 0) {
    return {
      run_ids: [],
      runs: [],
      stopped_reason: 'terminal',
      polls: 0,
      elapsed_ms: 0,
      text: 'No runs were started, so there is nothing to wait for.',
    };
  }

  const wanted = new Set(runIds);
  const order = new Map(runIds.map((id, i) => [id, i] as const));
  let seen: RunSummaryLite[] = [];
  let polls = 0;
  let consecutiveFailures = 0;
  let lastError: string | null = null;

  for (;;) {
    try {
      const all = await apiGet<RunSummaryLite[]>(`/pulls/${prId}/runs`);
      polls += 1;
      consecutiveFailures = 0;
      seen = all
        .filter((r) => wanted.has(r.run_id))
        .sort((a, b) => (order.get(a.run_id) ?? 0) - (order.get(b.run_id) ?? 0));
    } catch (err) {
      polls += 1;
      consecutiveFailures += 1;
      lastError = err instanceof Error ? err.message : String(err);
      log.warn(`poll ${polls} of ${prId} failed (${consecutiveFailures} in a row): ${lastError}`);
      if (consecutiveFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
        const elapsed = Date.now() - startedAt;
        return {
          run_ids: runIds,
          runs: seen,
          stopped_reason: 'api_error',
          polls,
          elapsed_ms: elapsed,
          text: report(input, seen, 'api_error', elapsed, lastError),
        };
      }
    }

    const done = seen.filter((r) => isTerminal(r.status));
    const allDone = seen.length === runIds.length && done.length === runIds.length;
    const elapsed = Date.now() - startedAt;

    if (allDone) {
      return {
        run_ids: runIds,
        runs: seen,
        stopped_reason: 'terminal',
        polls,
        elapsed_ms: elapsed,
        text: report(input, seen, 'terminal', elapsed, lastError),
      };
    }

    if (elapsed >= timeoutMs) {
      return {
        run_ids: runIds,
        runs: seen,
        stopped_reason: 'timeout',
        polls,
        elapsed_ms: elapsed,
        text: report(input, seen, 'timeout', elapsed, lastError),
      };
    }

    if (notify) {
      // Resets the client's idle window; does NOT extend its wall clock.
      await notify({
        progress: done.length,
        total: runIds.length,
        message: `${done.length}/${runIds.length} run(s) finished after ${seconds(elapsed)}`,
      });
    }

    // Clamped to what is left of the budget so the cut-off lands on `timeoutMs`
    // rather than up to one interval past it.
    await sleep(Math.min(pollIntervalMs(elapsed), timeoutMs - elapsed));
  }
}
