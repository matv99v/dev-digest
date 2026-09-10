/**
 * Local response types — the ONLY place in this package where a server field
 * name is spelled.
 *
 * These are deliberately **not** `@devdigest/shared`. There is no path alias
 * into the vendored contracts and there must never be one: this package is on
 * zod 4 while `reviewer-core` is on zod 3, and the two only stay apart because
 * nothing imports across. Beyond the version split, the vendored contracts
 * already exist in two copies that have drifted (`server/INSIGHTS.md:88-99`)
 * and their barrel's `export *` collisions are silent
 * (`server/INSIGHTS.md:70-86`) — a third consumer would make that a three-way
 * problem.
 *
 * The trade is explicit: a renamed server field fails at **runtime**, not at
 * `tsc`. The mitigation is narrowness — every field below is one a tool
 * actually reads, and the contract each mirrors is cited so a drift is a
 * two-file diff to check.
 *
 * Every one of these is the shape of a **JSON response body**, so field names
 * are snake_case, matching the wire and not the server's internal camelCase.
 */

/** `contracts/findings.ts:11` */
export type Severity = 'CRITICAL' | 'WARNING' | 'SUGGESTION';

/** `contracts/findings.ts:15` */
export type FindingCategory = 'bug' | 'security' | 'perf' | 'style' | 'test';

/** `contracts/findings.ts:26` */
export type Verdict = 'request_changes' | 'approve' | 'comment';

/** `contracts/knowledge.ts:157` */
export type Provider = 'openai' | 'anthropic' | 'openrouter';

/** `contracts/knowledge.ts:164` */
export type ReviewStrategy = 'single-pass' | 'map-reduce' | 'auto';

/** `contracts/knowledge.ts:172` */
export type CiFailOn = 'never' | 'critical' | 'warning' | 'any';

/** `contracts/conventions.ts:13` */
export type ConventionStatus = 'pending' | 'accepted' | 'rejected';

/**
 * One row of `GET /agents` — mirrors `contracts/knowledge.ts:176` (`Agent`)
 * **minus `system_prompt` and `output_schema`**.
 *
 * `system_prompt` is absent on purpose, and that absence is R3: because the
 * type has no such field, a projection through it cannot leak the prompt, and
 * an attempt to pass one through fails at compile time rather than in a
 * transcript. Do not add it back "for completeness" — nothing reads it.
 */
export interface AgentSummary {
  id: string;
  name: string;
  description: string;
  provider: Provider;
  model: string;
  enabled: boolean;
  strategy: ReviewStrategy;
  ci_fail_on: CiFailOn;
}

/**
 * One row of `GET /pulls/:id/runs` — mirrors `contracts/trace.ts:103`
 * (`RunSummary`), narrowed to what the poll loop and its report read.
 *
 * `status` is `running | done | failed | cancelled` on the server but typed
 * there as a bare nullable string, so it is one here too: a status this package
 * does not know about must stay readable rather than fail a parse.
 *
 * `error` and `duration_ms` are both nullable, and their *combination* carries
 * meaning — `status:'failed'` with `error:null` **and** `duration_ms:null` is
 * the stale-run reaper's signature (`server/INSIGHTS.md:115-132`), not a review
 * failure. That distinction is R5, and it is `src/tools/poll.ts`'s to make.
 */
export interface RunSummaryLite {
  run_id: string;
  agent_id: string | null;
  agent_name: string | null;
  status: string | null;
  error: string | null;
  duration_ms: number | null;
  score: number | null;
  findings_count: number | null;
  blockers: number | null;
  cost_usd: number | null;
  ran_at: string | null;
}

/**
 * One finding inside a review — mirrors `contracts/findings.ts:47` (`Finding`)
 * as extended by `FindingRecord` (`contracts/review-api.ts:15`).
 *
 * `rationale` and `suggestion` are the two markdown size drivers; the `concise`
 * projection drops exactly these two (R6).
 */
export interface FindingLite {
  id: string;
  severity: Severity;
  category: FindingCategory;
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  rationale: string;
  suggestion?: string | null;
  confidence: number;
}

/**
 * One row of `GET /pulls/:id/reviews` — mirrors `contracts/review-api.ts:23`
 * (`ReviewRecord`). `run_id` is nullable, which is why `get_findings`'s
 * `run_id` filter is client-side and must tolerate rows that carry none.
 */
export interface ReviewLite {
  id: string;
  pr_id: string;
  agent_id: string | null;
  run_id: string | null;
  agent_name?: string | null;
  kind: 'summary' | 'review';
  verdict: Verdict | null;
  summary: string | null;
  score: number | null;
  model: string | null;
  created_at: string;
  findings: FindingLite[];
}

/** `contracts/conventions.ts:16` (`ConventionEvidence`). `snippet` is what the
 *  `concise` projection drops (R7); `path` and the line range stay. */
export interface ConventionEvidenceLite {
  path: string;
  line_start: number;
  line_end: number;
  snippet: string;
}

/** One candidate of `GET /repos/:id/conventions` — mirrors
 *  `contracts/conventions.ts:24` (`Convention`). */
export interface ConventionLite {
  id: string;
  repo_id: string;
  category: string | null;
  rule: string;
  evidence: ConventionEvidenceLite;
  confidence: number;
  status: ConventionStatus;
  scanned_sha: string | null;
  created_at: string;
}

/**
 * The whole body of `GET /repos/:id/conventions` — mirrors
 * `contracts/conventions.ts:38` (`ConventionScan`).
 *
 * The counters are not decoration: `get_conventions` returns them alongside a
 * truncated candidate list so that a truncated result is *visibly* truncated
 * rather than indistinguishable from a small one.
 */
export interface ConventionScanLite {
  candidates: ConventionLite[];
  sampled_files: number;
  dropped_unverified: number;
  scanned_sha: string | null;
  scanned_at: string | null;
}

/** One row of `GET /repos` — mirrors `contracts/platform.ts:140` (`Repo`).
 *  `full_name` is what `resolveRepo` matches an `owner/repo` ref against. */
export interface RepoLite {
  id: string;
  owner: string;
  name: string;
  full_name: string;
}

/**
 * One row of `GET /repos/:id/pulls` — mirrors `contracts/platform.ts:157`
 * (`PrMeta`), narrowed to what `resolvePr` matches on and what a not-found
 * message lists back.
 *
 * `id` is nullable in the contract (the shape is reused for PRs that exist on
 * GitHub but not yet in the database). On this route every row is a persisted
 * one and carries an id — but the nullability is kept rather than asserted
 * away, so `resolvePr` reports "found the PR, but it has no id" as a miss
 * instead of returning `undefined` as a uuid.
 */
export interface PrMetaLite {
  id: string | null;
  number: number;
  title: string;
  status: string;
}

/**
 * The immediate body of `POST /pulls/:id/review` — mirrors
 * `contracts/review-api.ts:51` (`ReviewRunResponse`), narrowed to the started
 * run identities.
 *
 * `reviews` is deliberately **not** here: the route returns before the reviews
 * exist, which is the whole reason `run_agent_on_pr` polls. Read `runs[].run_id`
 * and poll `GET /pulls/:id/runs`; never re-POST (that route is capped at
 * 10/min, `server/src/modules/reviews/routes.ts:29`).
 */
export interface ReviewRunStartedLite {
  pr_id: string;
  runs: Array<{ run_id: string; agent_id: string; agent_name: string }>;
}
