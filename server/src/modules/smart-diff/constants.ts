/**
 * Smart Diff (L03) — every pattern, basename list, and threshold the
 * classifier reads, plus the precedence order those checks run in.
 *
 * `helpers.ts` imports every value below and defines none of its own: no
 * regex literal, no path string, no numeric threshold lives there. A value
 * inlined in `helpers.ts` *in addition to* here would let the two drift
 * silently — the tests in `smart-diff-helpers.test.ts` derive every boundary
 * from the constant imported here (e.g. `SPLIT_TOO_BIG_MAX_LINES` and
 * `SPLIT_TOO_BIG_MAX_LINES + 1`, never a literal `400`), specifically so that
 * moving a value here without also moving it in `helpers.ts` cannot leave a
 * green test behind a stale classifier (R5).
 *
 * PRECEDENCE — first match wins. `classifyPath` (`helpers.ts`) checks these,
 * in exactly this order:
 *   1. LOCKFILE_BASENAMES (basename, any depth)                → boilerplate
 *      R2 makes this unconditional — it runs first so no later rule can
 *      reclassify a lock-file.
 *   2. GENERATED_PATH_SEGMENTS / GENERATED_BASENAME_SUFFIXES    → boilerplate
 *      Build output and snapshots. `/db/migrations/meta/` catches
 *      drizzle-kit's own snapshots while leaving `db/migrations/*.sql` to
 *      fall through to `core` — a migration is the substance of a change.
 *   3. DOC_EXTENSIONS                                           → boilerplate
 *      Prose, not executable behaviour.
 *   4. TEST_BASENAME_PATTERNS / TEST_PATH_SEGMENTS              → wiring
 *      A test is how the change is proved, so it must be read — but after
 *      the logic it covers. Catches `server/test/**` and `*.it.test.ts` alike.
 *   5. CONFIG_BASENAMES / CONFIG_BASENAME_PATTERNS / CI_PATH_PREFIXES → wiring
 *      Note `package.json` is `wiring` while `pnpm-lock.yaml` is
 *      `boilerplate` — rule 1 already decided the second.
 *   6. BARREL_BASENAMES                                         → wiring
 *   7. nothing matched                                          → DEFAULT_ROLE ('core')
 *      An unrecognised path is business logic until proven otherwise.
 *
 * Matching is on a normalised path: `classifyPath` matches segment rules
 * against `'/' + path` (so a leading `test/` matches `/test/`), basename
 * rules against the last segment, and extension rules case-insensitively.
 */

import type { SmartDiffRole } from '@devdigest/shared';

// Plain `string[]` / `RegExp[]` (not `as const` tuples) on every list below
// that a helper checks with `.includes(basename)` against a caller-supplied
// `string` — a `readonly ["a", "b"]` literal-union element type rejects a
// plain `string` argument to `.includes`, which is not worth fighting for a
// list whose exact literal-per-element typing buys nothing here.

export const LOCKFILE_BASENAMES: string[] = [
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'npm-shrinkwrap.json',
  'bun.lockb',
  'Cargo.lock',
  'poetry.lock',
  'Gemfile.lock',
  'composer.lock',
  'go.sum',
];

export const GENERATED_PATH_SEGMENTS: string[] = [
  '/dist/',
  '/build/',
  '/out/',
  '/.next/',
  '/coverage/',
  '/node_modules/',
  '/__snapshots__/',
  '/__generated__/',
  '/db/migrations/meta/',
];

export const GENERATED_BASENAME_SUFFIXES: string[] = [
  '.snap',
  '.min.js',
  '.min.css',
  '.map',
  '.generated.ts',
  '.gen.ts',
];

export const DOC_EXTENSIONS: string[] = ['.md', '.mdx'];

export const TEST_BASENAME_PATTERNS: RegExp[] = [/\.test\.[cm]?[jt]sx?$/, /\.spec\.[cm]?[jt]sx?$/];

export const TEST_PATH_SEGMENTS: string[] = ['/test/', '/tests/', '/__tests__/'];

export const CONFIG_BASENAMES: string[] = [
  'package.json',
  'docker-compose.yml',
  'Dockerfile',
  '.env.example',
  '.gitignore',
  '.npmrc',
  '.nvmrc',
];

export const CONFIG_BASENAME_PATTERNS: RegExp[] = [
  /^tsconfig(\..+)?\.json$/,
  /\.config\.[cm]?[jt]s$/,
  /^\.eslintrc.*$/,
  /^\.prettierrc.*$/,
];

export const CI_PATH_PREFIXES: string[] = ['.github/workflows/'];

export const BARREL_BASENAMES: string[] = ['index.ts', 'index.tsx', 'index.js', 'index.mjs'];

export const DEFAULT_ROLE: SmartDiffRole = 'core';

export const ROLE_ORDER: readonly SmartDiffRole[] = ['core', 'wiring', 'boilerplate'] as const;

export const SPLIT_TOO_BIG_MAX_LINES = 400;
export const SPLIT_TOO_BIG_MAX_FILES = 20;
export const SPLIT_KEY_SEGMENTS = 2;
export const MIN_SPLIT_FILES = 2;
export const MAX_PROPOSED_SPLITS = 4;

export const MAX_FINDING_LINE_SPAN = 50;
export const MAX_FINDING_LINES_PER_FILE = 200;
