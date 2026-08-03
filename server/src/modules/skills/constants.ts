/** Constants for the skills module. */

/** Initial version recorded for a newly-created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Default description when none is supplied on insert. */
export const DEFAULT_SKILL_DESCRIPTION = '';

/** Fallback type when a markdown import has none in its frontmatter. */
export const DEFAULT_IMPORT_SKILL_TYPE = 'custom' as const;

/** Body-size cap for an imported markdown file — beyond this we truncate and
 *  warn rather than reject; keeps one accidental huge paste from blowing the
 *  prompt-token budget on every future review. */
export const MAX_IMPORT_BODY_CHARS = 64_000;
