/** Constants for the conventions module. */

/** Config files probed at the repo root — read individually, missing ones skipped. */
export const CONFIG_FILE_CANDIDATES: readonly string[] = [
  'package.json',
  'tsconfig.json',
  'eslint.config.js',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.cjs',
  '.prettierrc',
  '.prettierrc.json',
  'prettier.config.js',
  '.editorconfig',
];

/** How many top-ranked source files repo-intel samples for the scan. */
export const SAMPLE_FILE_COUNT = 12;

/** Byte cap per sampled file's content before it's sent to the model. */
export const MAX_FILE_BYTES = 20_000;

/**
 * Line-slack window (in lines, each side of the cited range) `verifyCandidates`
 * searches for a candidate's snippet before dropping it. A candidate found
 * inside the window but off the cited lines is snapped rather than dropped.
 */
export const VERIFY_LINE_SLACK = 3;

/**
 * Hard timeout for the single structured extraction call. Deliberately below
 * JobRunner's 120s cap (this route runs synchronously, not through a job — see
 * service.ts) so a hung provider still returns a clean error to the client.
 */
export const EXTRACT_TIMEOUT_MS = 60_000;

/** Retries `withRetry` gives the extraction call on a 429/5xx before giving up. */
export const EXTRACT_RETRIES = 2;

/** `schemaName` sent to `completeStructured` — must match the mock's fixture key. */
export const CONVENTION_EXTRACTION_SCHEMA_NAME = 'ConventionExtraction';
