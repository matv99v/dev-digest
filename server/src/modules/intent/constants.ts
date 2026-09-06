/** Constants for the PR Intent Layer (L03). */

/**
 * `schemaName` sent to `completeStructured` — MUST match the key
 * `MockLLMProvider.structuredBySchema` is looked up by in tests
 * (`src/adapters/mocks.ts`).
 */
export const INTENT_DERIVATION_SCHEMA_NAME = 'IntentDerivation';

/** Hard timeout for the single structured derivation call. */
export const DERIVE_TIMEOUT_MS = 45_000;

/** Retries `withRetry` gives the derivation call on a 429/5xx before giving up. */
export const DERIVE_RETRIES = 2;

/** Max in/out-of-scope list length kept after `dropUngroundedScope`. */
export const MAX_SCOPE_ITEMS = 8;

/** Max characters kept per scope item. */
export const MAX_SCOPE_ITEM_CHARS = 160;

/** Max characters kept for the `intent` narrative itself. */
export const MAX_INTENT_CHARS = 600;

/** Max in-repo markdown files read per derivation. */
export const MAX_DOCS = 3;

/** Byte cap per resolved doc's content before it's sent to the model. */
export const MAX_DOC_BYTES = 20_000;

/**
 * Minimum length of PR-body prose (after `stripBodyNoise`) for `computeConfidence`
 * to treat the body as real documentation worth a `medium` confidence.
 */
export const MIN_BODY_PROSE_CHARS = 120;

/**
 * Minimum number of DISTINCT ATX headings from one of this repo's own two
 * templates (spec / plan) for `detectInlinePlan` to recognise a body as a
 * pasted-in plan or spec. Two is reachable by an ordinary PR template (e.g.
 * "Goal" + "Scope"); three is not — see `helpers.ts#detectInlinePlan`.
 */
export const INLINE_PLAN_MIN_HEADINGS = 3;

/**
 * Ordinary prose is capped at `MAX_BODY_CHARS` (matches `reviewer-core`'s
 * `MAX_PR_DESCRIPTION_CHARS`). A body `detectInlinePlan` recognises gets the
 * much larger `MAX_INLINE_PLAN_CHARS` instead — a single 4 000-char cap would
 * truncate a pasted plan mid-document, losing exactly the Design / Out-of-
 * scope sections that make the intent authoritative about what is NOT in
 * scope. Whichever cap applies, the block is still `wrapUntrusted`-wrapped —
 * a longer allowance is not more trust.
 */
export const MAX_BODY_CHARS = 4_000;

/** Cap for a body/issue body `detectInlinePlan` recognises as a plan/spec. */
export const MAX_INLINE_PLAN_CHARS = 20_000;

/**
 * Allowed top-level directories for a resolved in-repo doc link, plus
 * root-level `*.md` files (handled separately in `resolveRepoDocPath`).
 */
export const DOC_ROOTS: readonly string[] = ['docs/', 'specs/', 'doc/', 'adr/', 'rfcs/'];
