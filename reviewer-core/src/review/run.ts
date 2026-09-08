import type {
  Finding,
  LLMProvider,
  PromptAssembly,
  Review,
  RunEventKind,
  UnifiedDiff,
} from '@devdigest/shared';
import { Review as ReviewSchema } from '@devdigest/shared';
import { assemblePrompt } from '../prompt.js';
import { groundFindings, groundingSummary } from '../grounding.js';
import { reduceReviews, scoreFromFindings, sliceDiff } from './reduce.js';

/**
 * reviewPullRequest — the review engine entry point.
 *
 * given (diff + resolved agent inputs + injected LLM) → grounded Review.
 *
 * This is the pure core lifted out of the server's `ReviewService.runOneAgent`:
 * assemble prompt → single-pass OR map-reduce per file → reduce → SHARED
 * citation-grounding gate. It performs NO I/O beyond the injected LLM provider
 * (no DB, GitHub, fs, memory retrieval, intent, or persistence) — those stay in
 * the caller (server persists + streams SSE; runner posts + writes an artifact).
 *
 * Skill bodies / memory / specs are RESOLVED strings here: the caller turns
 * AgentManifest skill slugs into bodies (DB in the studio, fs in the runner).
 */

/** Default map-reduce threshold (matches the server's FILE_MAP_THRESHOLD_LINES). */
export const DEFAULT_MAP_THRESHOLD_LINES = 400;
/** Default structured-output reprompt retries (matches REVIEW_MAX_RETRIES). */
export const DEFAULT_REVIEW_MAX_RETRIES = 2;
/**
 * Default output ceiling for a single `completeStructured` call, in tokens.
 * This is a PER-CALL ceiling, not a per-review budget: the map-reduce path
 * issues one call per file, so a large multi-file diff can still spend a
 * multiple of this across the whole run.
 *
 * Deliberately generous, because on a reasoning model `max_tokens` bounds
 * reasoning + content, not content. Measured over 47 completed runs against
 * `deepseek-v4-flash`, the emitted review body never exceeded ~1.5k tokens,
 * while billed completion tokens for those same runs ranged from 151 to
 * 231_197 - a spread of three orders of magnitude driven by how long the
 * model thought, not by how much it found. A ceiling tight enough to bound
 * the body would therefore truncate healthy runs: 11 of those 47 (7 of them
 * single-pass, several carrying real findings) billed more than 8192.
 *
 * 64_000 sits above the largest single-pass run observed (46_091) and below
 * the runaway cluster (134_670 / 136_763 / 231_197), so it fires as a runaway
 * guard and not as a routine cap. Streaming is what actually keeps the
 * transport alive; this is the second line, and a second line that trips on
 * healthy traffic is worse than none.
 */
export const DEFAULT_REVIEW_MAX_OUTPUT_TOKENS = 64_000;
/**
 * Default wall-clock budget for a single `completeStructured` call, in
 * milliseconds. Like the token ceiling above, this bounds one call - the
 * map-reduce path can still run for a multiple of this across all its
 * per-file calls.
 *
 * Chosen from the observed gap rather than from a token-rate estimate. Across
 * the same 47 completed runs, every success finished within 622_298ms except
 * three runaways (2_290_928 / 2_685_941 / 5_354_347), while every transport
 * failure landed between 975_446ms and 1_102_692ms. Nothing at all sits
 * between 622s and 975s, so 900_000ms clears the slowest healthy run by a
 * wide margin and still fires before the band where the socket dies on its
 * own - which is the point: a run should end with this error naming its
 * budget, not with an undici read error naming nothing.
 */
export const DEFAULT_LLM_TIMEOUT_MS = 900_000;

export type ReviewStrategy = 'auto' | 'single-pass' | 'map-reduce';
export type ReviewMode = 'single-pass' | 'map-reduce';

/** Progress event emitted during a review (server → SSE bus, runner → log). */
export interface ReviewEvent {
  kind: RunEventKind;
  msg: string;
  data?: unknown;
}

export interface ReviewInput {
  /** Agent system prompt (trusted). */
  systemPrompt: string;
  /** Model id understood by the injected provider (e.g. 'deepseek/deepseek-v4-flash'). */
  model: string;
  /** The PR's unified diff (already parsed; hunks carry new-side line numbers). */
  diff: UnifiedDiff;
  /** Injected LLM provider (OpenRouter in CI, OpenAI/Anthropic in the studio). */
  llm: LLMProvider;
  /** 'auto' (default) picks single-pass unless the diff is large + multi-file. */
  strategy?: ReviewStrategy;
  /** Resolved skill bodies (NOT slugs). */
  skills?: string[];
  /** Curated memory items. */
  memory?: string[];
  /** Project-context spec chunks (untrusted; delimiter-wrapped downstream). */
  specs?: string[];
  /**
   * Optional callers-of-changed-symbols digest (T1.3). Untrusted; rendered
   * before the diff section. Empty/undefined → section omitted.
   */
  callers?: string;
  /**
   * Optional repo skeleton / map (T3). Untrusted; rendered before the project
   * context section. Empty/undefined → section omitted.
   */
  repoMap?: string;
  /** PR author's description/body (untrusted; truncated + delimiter-wrapped in
      the prompt). Empty/undefined → section omitted. */
  prDescription?: string;
  /** Derived PR intent (L03; untrusted, truncated + delimiter-wrapped in the
      prompt). Empty/undefined → section omitted. */
  intent?: string;
  /** Task framing line, e.g. "Review PR #482 …". */
  task?: string;
  /** Override the structured-output retry budget. */
  maxRetries?: number;
  /** Override the map-reduce line threshold. */
  mapThresholdLines?: number;
  /**
   * Override the per-call output ceiling (default DEFAULT_REVIEW_MAX_OUTPUT_TOKENS).
   * Applies to each `completeStructured` call individually — in map-reduce
   * mode that means per file, not per review.
   */
  maxOutputTokens?: number;
  /**
   * Override the per-call wall-clock budget, in ms (default DEFAULT_LLM_TIMEOUT_MS).
   * Applies to each `completeStructured` call individually — in map-reduce
   * mode that means per file, not per review.
   */
  llmTimeoutMs?: number;
  /**
   * OpenRouter session id — forwarded on every LLM call so all chunks of this
   * review group into one session in the OpenRouter dashboard.
   */
  sessionId?: string;
  /** Progress sink. */
  onEvent?: (e: ReviewEvent) => void;
  /**
   * Cancellation checkpoint, called before each (expensive) chunk LLM call.
   * Supply a function that THROWS to abort mid-run (the caller owns the error
   * type, e.g. the server's RunCancelledError); the engine stays agnostic.
   */
  checkCancelled?: () => void;
  /**
   * Usage sink, fired after each successful chunk AND when a chunk's
   * `completeStructured` call throws an error that carries numeric
   * `tokensIn`/`tokensOut` own properties (e.g. OpenRouterProvider's
   * StructuredCallError) — so tokens genuinely consumed by a failed call are
   * still attributed. The caller (server) accumulates these to record real
   * usage on a failed run instead of hard zeros.
   */
  onUsage?: (u: { tokensIn: number; tokensOut: number; costUsd: number | null }) => void;
}

export interface ReviewOutcome {
  /** The reduced, GROUNDED review (findings that survived the citation gate). */
  review: Review;
  /** Human-readable grounding summary, e.g. "3/4 passed". */
  grounding: string;
  /** Findings dropped by grounding, with reasons (for logs / "never go silent"). */
  dropped: { finding: Finding; reason: string }[];
  /** Which path ran. */
  mode: ReviewMode;
  /** Prompt assembly (for the run trace). Single-pass: the one call; map-reduce: the whole-diff assembly. */
  assembly: PromptAssembly;
  /** Per-chunk labels (for the run trace's tool_calls). */
  chunks: { label: string }[];
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  /** Joined raw model outputs (for the run trace). */
  raw: string;
}

function selectMode(strategy: ReviewStrategy, diff: UnifiedDiff, threshold: number): ReviewMode {
  if (strategy === 'single-pass') return 'single-pass';
  if (strategy === 'map-reduce') return diff.files.length > 1 ? 'map-reduce' : 'single-pass';
  // auto: map-reduce only when the diff is both large AND multi-file (else 1 call).
  const totalLines = diff.files.reduce((n, f) => n + f.additions + f.deletions, 0);
  return totalLines > threshold && diff.files.length > 1 ? 'map-reduce' : 'single-pass';
}

export async function reviewPullRequest(input: ReviewInput): Promise<ReviewOutcome> {
  const threshold = input.mapThresholdLines ?? DEFAULT_MAP_THRESHOLD_LINES;
  const maxRetries = input.maxRetries ?? DEFAULT_REVIEW_MAX_RETRIES;
  const mode = selectMode(input.strategy ?? 'auto', input.diff, threshold);
  const emit = (kind: RunEventKind, msg: string, data?: unknown) =>
    input.onEvent?.({ kind, msg, data });
  // Guarded the same way `emit` guards `onEvent` — onUsage must never throw
  // into the run, and a throwing sink shouldn't crash it or mask the real error.
  const reportUsage = (u: { tokensIn: number; tokensOut: number; costUsd: number | null }) => {
    try {
      input.onUsage?.(u);
    } catch {
      // ignore — a broken sink must not affect the review outcome.
    }
  };

  const promptParts = {
    system: input.systemPrompt,
    skills: input.skills,
    memory: input.memory,
    specs: input.specs,
    callers: input.callers,
    repoMap: input.repoMap,
    prDescription: input.prDescription,
    intent: input.intent,
    task: input.task,
  };

  // Whole-diff assembly is the trace default; overwritten below for single-pass.
  let assembly: PromptAssembly = assemblePrompt({ ...promptParts, diff: input.diff.raw }).assembly;

  const chunks =
    mode === 'map-reduce'
      ? input.diff.files.map((f) => ({ label: f.path, diffText: sliceDiff(input.diff, f.path) }))
      : [{ label: 'all files', diffText: input.diff.raw }];

  emit(
    'info',
    mode === 'map-reduce'
      ? `Large diff → map-reduce over ${input.diff.files.length} files`
      : `Reviewing ${input.diff.files.length} changed file(s) in one pass`,
  );

  const partials: Review[] = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let costUsd: number | null = 0;
  const raws: string[] = [];

  for (const chunk of chunks) {
    // Cancellation checkpoint — stop before the next (expensive) LLM call.
    input.checkCancelled?.();
    // 'map:' prefix only for the map-reduce path (one call per file). In
    // single-pass there is exactly one chunk (the whole diff) — don't mislabel it.
    emit(
      'tool',
      mode === 'map-reduce' ? `map: reviewing ${chunk.label}` : `Reviewing ${chunk.label} in one pass`,
      { file: chunk.label },
    );
    const a = assemblePrompt({ ...promptParts, diff: chunk.diffText });
    if (mode === 'single-pass') assembly = a.assembly;
    let res;
    try {
      res = await input.llm.completeStructured<Review>({
        model: input.model,
        schema: ReviewSchema,
        schemaName: 'Review',
        messages: a.messages,
        maxRetries,
        maxTokens: input.maxOutputTokens ?? DEFAULT_REVIEW_MAX_OUTPUT_TOKENS,
        timeoutMs: input.llmTimeoutMs ?? DEFAULT_LLM_TIMEOUT_MS,
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      });
    } catch (err) {
      // A provider (e.g. OpenRouterProvider's StructuredCallError) may attach
      // usage accumulated across completed round-trips before it had to give
      // up. Read those fields STRUCTURALLY — no `instanceof`, since that
      // provider's error class is deliberately not exported from
      // src/index.ts — and report them before rethrowing the ORIGINAL error
      // unchanged, so `err instanceof RunCancelledError` still holds for the
      // caller (server's run-executor.ts).
      const withUsage = err as { tokensIn?: unknown; tokensOut?: unknown; costUsd?: unknown };
      if (typeof withUsage.tokensIn === 'number' && typeof withUsage.tokensOut === 'number') {
        reportUsage({
          tokensIn: withUsage.tokensIn,
          tokensOut: withUsage.tokensOut,
          costUsd: typeof withUsage.costUsd === 'number' ? withUsage.costUsd : null,
        });
      }
      throw err;
    }
    tokensIn += res.tokensIn;
    tokensOut += res.tokensOut;
    costUsd = costUsd == null || res.costUsd == null ? null : costUsd + res.costUsd;
    raws.push(res.raw);
    partials.push(res.data);
    reportUsage({ tokensIn: res.tokensIn, tokensOut: res.tokensOut, costUsd: res.costUsd });
    emit('result', `${chunk.label}: ${res.data.findings.length} candidate finding(s)`);
  }

  const merged = reduceReviews(partials);
  emit(
    'result',
    `Reduced to ${merged.findings.length} finding(s); verdict=${merged.verdict}, score=${merged.score}`,
  );

  // SHARED citation-grounding gate (the only post-step; not duplicated per strategy).
  const ground = groundFindings(merged.findings, input.diff);
  const grounding = groundingSummary(ground);
  for (const d of ground.dropped) {
    emit('info', `grounding dropped "${d.finding.title}": ${d.reason}`);
  }
  emit('result', `Citation grounding: ${grounding}`);

  // Score is derived from the findings that SURVIVED grounding (not the model's
  // self-reported number, and not the pre-grounding set) so the score, the
  // findings list, and the deterministic event always agree.
  return {
    review: { ...merged, findings: ground.kept, score: scoreFromFindings(ground.kept) },
    grounding,
    dropped: ground.dropped,
    mode,
    assembly,
    chunks: chunks.map((c) => ({ label: c.label })),
    tokensIn,
    tokensOut,
    costUsd,
    raw: raws.join('\n---\n'),
  };
}
