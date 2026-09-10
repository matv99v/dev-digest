# Insights — reviewer-core

Lessons learned working in `@devdigest/reviewer-core`. Append with
`/engineering-insights`. **Never rewrite or delete an entry** — correct an outdated one
by adding a newer dated entry that supersedes it. If a finding also concerns another
module, write that module's half in its own `INSIGHTS.md`. The root file is for root
config and CI only.

When an entry has bitten twice, promote its **Rule** into `AGENTS.md` and leave the cause
here. Architectural decisions with reasoning belong in `docs/`, not here. Prune
quarterly; past ~30 entries, split by domain.

<!-- Entry format — newest first inside its section:
### YYYY-MM-DD — one-line statement of the finding
**Cause:** what was actually wrong (omit when nothing failed).
**Rule:** what to do or avoid next time. Required.
**Evidence:** `path/to/file.ts:42`. Required.
-->

## What Works

_No entries yet._

## What Doesn't Work

### 2026-09-07 — sizing `max_tokens` from the size of the review body, on a reasoning model
**Cause:** `DEFAULT_REVIEW_MAX_OUTPUT_TOKENS` was first set to 8192 by reasoning about output
*size* — 2× the 4096 that `server/src/adapters/llm/anthropic.ts:17` already ships for the same
`Review` schema. That derivation silently assumes `max_tokens` bounds content. On a reasoning
model it bounds reasoning + content, and the two are uncorrelated: across 47 completed runs on
`deepseek-v4-flash` the emitted body never exceeded ~1.5k tokens (largest stored `raw_output`
5 802 chars) while billed completion tokens spanned 151 → 231 197, varying with how long the
model thought rather than with how much it found. 11 of the 47 — 7 of them single-pass, several
carrying real findings — billed over 8192, so the "generous" ceiling would have truncated ~23%
of healthy traffic.
**Rule:** Never derive a token ceiling or a timeout for this engine from an estimate of output
length. Derive it from `agent_runs` (`tokens_out`, `duration_ms`, `status`) joined to
`run_traces` (`trace->>'raw_output'` for the real body size) — the run history is right there,
and it disagrees with the estimate by two orders of magnitude. Same query settled the timeout:
successes ≤ 622 298 ms, transport failures 975 446–1 102 692 ms, nothing between.
**Evidence:** `reviewer-core/src/review/run.ts:33-72` (both constants and the measurements
behind them); `docs/plans/05-long-run-llm-resilience.md:84-85` (the superseded estimates).

## Codebase Patterns

_No entries yet._

## Tool & Library Notes

### 2026-09-07 — the `openai` SDK's SSE parser throws on an `error` payload, it never yields it as a chunk
**Cause:** Streaming a chat completion with an OpenRouter-style `{"error":{...}}` payload in
the SSE body was expected to surface as a normal `ChatCompletionChunk` with an `error` field,
readable inside the `for await` loop. It doesn't: `Stream.fromSSEResponse` (`openai/streaming.mjs`,
`_iterSSEMessages`) parses each `data:` line and throws an `APIError` synchronously the moment
`data.error` is truthy, so the chunk is never yielded — the only place to observe it is the
`catch` around the iteration, not inside it.
**Rule:** When translating an "HTTP 200 with an error body" guard onto a streamed request,
put the guard in the `try/catch` wrapping `for await (const chunk of stream)`, not in the loop
body — per-chunk `.error` inspection is dead code against this SDK version.
**Evidence:** `reviewer-core/src/llm/openrouter.ts:166-182` (catch-based handling);
`reviewer-core/node_modules/openai/streaming.mjs:28-42` (where the SDK throws).

## Recurring Errors & Fixes

_No entries yet._

## Session Notes

_No entries yet._

## Open Questions

_No entries yet._
